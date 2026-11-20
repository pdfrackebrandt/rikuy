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

Version 31 (2026-11-10) is the public launch: the hosted build ran at
<https://rikuy-3dl.pages.dev/> (deployed from main by `deploy.yml`; since 2026-11-13 at
<https://rikuy.rackebrandt.pe/>, to which the old address redirects since 2026-11-20), with task 28's fixes for a
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
    old address served the same deployment, not redirected, until 2026-11-20, when Pedro added a
    Bulk Redirect in Cloudflare: `rikuy-3dl.pages.dev` now answers with a permanent redirect to
    `rikuy.rackebrandt.pe`. Browsers keep documents by address, so documents kept in a browser at
    the old address are no longer reachable there; a copy installed from the old address keeps
    working offline, with its documents.
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
40. **B2, paragraphs as in Word.** Done in the code (branch `wordgap-b2-para`, on task 38's frame;
    GAP rows H39, H42 to H55, H58, L11, D5, and Show marks of H41). *Alignment:* Home's Align Left,
    Center, Align Right and Justify (Ctrl+L, E, R, J on the page) write `flushleft`, `center` and
    `flushright` around the paragraph; Justify, LaTeX's own, takes it off; pressed again an alignment
    goes back to justified. Selected paragraphs share one environment; a paragraph in a group of
    centred ones is split out of it (the halves keep their head as written) and joined back when
    centred again, the bytes of before; in a figure or a table `\centering`, `\raggedleft`,
    `\raggedright` at its body's start. Hand written forms read and taken off exactly: the three
    environments indented or not, `{\centering ...\par}`, a declaration a minipage scopes. What
    belongs to the paragraph moves with it (`\noindent` on its line, `\label` and comment lines after
    it, its `\vspace` lines); what reaches further stays outside (`\onehalfspacing` or
    `\selectlanguage` on a line before it). *Line and Paragraph Spacing* (a menu): 1.0, 1.15, 1.5,
    2.0, 2.5, 3.0 for the paragraph (setspace's `singlespace`, `spacing{1.15}`, `onehalfspace`,
    `doublespace`; memoir's own), "Whole document" in the preamble (`\onehalfspacing`,
    `\setstretch{1.15}`; a hand written `\linespread`, `\setstretch`, `\baselinestretch` or setspace
    option changed in its own form; single takes it off), Add or Remove Space Before or After
    Paragraph (`\vspace{12pt}` on a line of its own). 1.5 and 2.0 are setspace's one and a half and
    double spacing, as LaTeX users mean them; Exactly and At least in the dialog are the nearest
    `\setstretch` (GAP H51). *Indents:* B3's Increase and Decrease Indent run `paragraph-indent` and
    `paragraph-outdent` outside a list: changepage's `adjustwidth`, Word's steps of 1.27 cm (memoir
    has it built in). *The Paragraph dialog* (Paragraph Settings, the right click menu, Line Spacing
    Options…): Indents and Spacing (alignment, direction where a right to left language is set up,
    left and right, first line or hanging by `\noindent\hangindent=`, before and after, line
    spacing Single to Multiple) and Line and Page Breaks (Widow/Orphan control as
    `\widowpenalty=10000` and `\clubpenalty=10000`, Keep with next `\nopagebreak`, Keep lines
    together `samepage`, Page break before `\clearpage`, Suppress line numbers lineno's
    `nolinenumbers`, Don't hyphenate babel's `hyphenrules{nohyphenation}`), and the whole
    document's line spacing, space between paragraphs and first line indent; OK writes what changed
    as one step (each change applied to the text the one before wrote, the edits the difference of
    the preamble and of the body). Tabs… puts a stop at the right margin with its leader at the
    caret (`\hfill`, `\dotfill`, `\hrulefill`). *Shading* (tcolorbox, the colour picked last, the
    picker for every colour; Word's standard colours are dvipsnames, given to xcolor before
    tcolorbox loads it) and *Borders* (Bottom and Top as rules, Outside as a framed tcolorbox, No
    Border, Horizontal Line as a paragraph of its own). *Show marks* (Ctrl+Shift+8, also View ›
    Formatting marks): ¶ at each paragraph's and heading's end, ↵ at `\\`, → at a fill, the space of
    a `\vspace`, drawn without taking room; kept as it was left. *Layout › Paragraph:* the spinbuttons
    Indent Left, Indent Right (cm), Spacing Before, Spacing After (pt); folded, each opens the dialog
    there. *Design › Paragraph Spacing:* Word's sets No Paragraph Space, Compact, Tight, Open, Relaxed,
    Double as parskip (`skip=`) or the class's own (KOMA's `parskip=`, memoir's `\abnormalparskip`)
    and setspace. Beamer: the document's spacing and parskip disabled with a reason. *The page* draws
    it as TeX prints it (model rows: the spacing environments' stretch, adjustwidth's margins and
    unindented first paragraph, tcolorbox's colour, padding and frame, samepage and `\nopagebreak` to
    the page breaks, `\hangindent` and TeX's register assignments read and not shown as text, no
    indent under an alignment declaration, parskip's `skip`, KOMA's option, memoir's commands, a
    figure without `\centering` at the left margin, `\dotfill`'s dots). *Word:* a paragraph's style
    named after its settings (Left Aligned, Line Spacing 1.5, Indent, Hanging, Keep With Next, Keep
    Lines Together) and given their formatting; the document's line spacing in the defaults; a
    Rikuy file comes back through its own source. Evidence: `npm test` green with
    `para.test.mjs` (16 groups, on the real model) and a Word export case (`word.test.mjs` 56);
    `para.py` 136 (with `dist/tex`: everything written compiles in the page, and TeX's PDF sets the
    centred, right, adjustwidth, tcolorbox, leader, hanging and one and a half spaced words where
    the page draws them; screenshots at 1920, 1366 and 390 px, light and dark); desktop pdfLaTeX,
    XeLaTeX and LuaLaTeX compile every construct; `tabs.py` 116; `ribbon.py` 268; `agent.py` 139;
    `browser.py` 189; `word.py` 110; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py`
    43/43; `pages_check.py` fits; the corpus model run 716 of 716. The
    security audit's quick profile (notes outside the repository) found five stalls a stranger's
    document could cause, fixed with tests: runs of spaces after `\renewcommand`, `\setlength`,
    `\parindent` or `\widowpenalty` made four patterns quadratic (20 000 spaces, 0.8 s at each move
    of the caret; now linear), a pattern over the whole source for line numbers, a slice taken
    again at each match, the block parsed again at each move, and `\nopagebreak` read quadratically
    by the model. Not done: Word import of a foreign `.docx`'s left alignment, line spacing and
    indents (they come in as plain paragraphs; center and right did and do); tab stops at a
    position (`tabbing`) beyond the right margin's leader; the page drawing `\hfill` to the
    margin (TeX does; the page leaves a gap); keep with next and widows weighed by the page's own
    page breaks beyond `\nopagebreak` and samepage; spaces shown as dots by Show marks, and
    `\label` and `%` lines as marks (they draw nothing on the page to hang a mark on); Distributed
    (H43, SKIP); Move paragraph up and down (H58) is B5's Alt+Shift+Up and Down, already done.
    *Review (PR 24, b265b6f), every finding fixed with its case as a test:* the commands run their
    paragraphs one after another (App.paraRun), each read again in the text the ones before left and
    the caret and the selection mapped through every edit, so a selection over a centred group and
    the paragraph after it gets one environment, every one closed, and the dialog over several
    paragraphs writes each at its place and leaves the caret on its words (1 to 3); a join looks for
    its neighbour as TeX reads it, never into a comment, a verbatim or a LaTeX paragraph (4, 5); Tabs
    writes its fill at the selection's end (6); the group forms take spaces, a line break and a
    comment, and a range that cuts a group, an environment, a command or a formula is no unit (7);
    in a quote, quotation, verse, the abstract, adjustwidth, a list, a theorem, tcolorbox or a
    minipage the alignment goes inside, and the page draws nothing centred there from around them,
    as TeX sets it (8); a figure without `\centering` is centred where beamer, the AMS classes,
    revtex, acmart, floatrow or `\@floatboxreset` centre it, `\centerline` and the `centering`
    environment read (9; the corpus's beamer decks draw as before); an environment taken off leaves
    the paragraph's own `\vspace`, `\clearpage`, `\nopagebreak` and rule lines on it, a comment after
    `\begin` kept (10); the dialog in a figure shows and sets its alignment without toggling, the
    rest of the dialog in the same step (11); More colors' HTML colour is a shading
    (`colback={rgb,255:red,231;green,84;blue,128}`, drawn) (12); `{\centering ...}` without `\par`
    is not centred (13); Home's Paragraph group is two rows of small buttons, as Word's (204 px, not
    382): with B1's Font group in two rows too, Home folds its spare Insert from 1920 px down, shows
    all six tiles to 1600 px, four at 1536, three to 1180 with the names going at 1366, the list at
    1100 px, Editing folding with Insert at 860 px (`tabs.py` and `ribbon.py` check those widths
    exactly) (14); an indented environment split and joined keeps its spaces (15);
    KOMA-Script's `parskip=half` is Open, `full` a whole line (16); a paragraph with display math is
    aligned whole (17); and the low ones: nowidow read as options, the model's parse reused at each
    move of the caret (a paragraph of a 190 KB environment: 3 ms), every paragraph of a long text
    at once (1500 in 0.6 s), a theorem's first paragraph says why, Show marks' arrow only at fills.
    The page's text keeps the font's own advances (`text-rendering: geometricPrecision` on the
    sheet): CI's Chromium hints fonts in full, which drew a centred or right aligned line 2 bp off
    TeX's; `para.py` checks it with full hinting. Since B3's lists the group's first row holds
    them and the group is one row below 861 px, folding there with Insert (`tabs.py`'s sweep: a
    wider window never shows fewer controls).
    On a phone (390 and 360 px, touch): Center, Justify, Line and Paragraph Spacing and Show marks
    by a tap, 44 px targets, the dialog fitting and scrolling, no sideways scroll. Evidence:
    `para.test.mjs` 28 groups (the reviewer's cases through paraUnits and paraRun on the real
    model); `para.py` 203 with `dist/tex` (the cases TeX refused compile, and where the page
    and TeX disagreed TeX's PDF now sets the words where the page draws them); `tabs.py` 115, `ribbon.py` 270, `font.py` 272, `features.py` 36 and `agent.py` 138 on main with B1; `browser.py` 189; `word.py` 111; `page.py` 139; `table.py` 161; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43; `pages_check.py` fits; the corpus model run 716 of 716; `npm test` green.
41. **B3, lists as in Word.** Done in the code (branch `wordgap-b3-lists`, on task 38's frame and
    B5's fold rule; GAP rows H32 to H38, H39 in lists, H40, A3, and task 29's labelled item).
    *Levels.* Tab and Shift+Tab in a list item (not in a table cell, whose keys they stay), and
    Home's new Increase Indent and Decrease Indent: the selected items one level down, under the
    item before them, into the list that ends that item or a new one of their kind; one level up,
    after the item they stood in, the items after them and what that item held after its list
    going under the last of them (`src/lists.js` `demote`, `promote`: the new text of the block,
    returned as its smallest edit with the caret and the selection followed into it; structural
    lines re-indented, never a verbatim one; CRLF files kept CRLF). Enter in an empty nested item
    takes it a level up, as Word's; Shift+Tab at the first level leaves the page as it always did;
    the first item has none to go under and a fifth level is refused (LaTeX nests four), each
    said in a toast and in the button's tooltip. Change List Level (menus, right click) goes to a
    level in one undo. Outside lists Increase and Decrease Indent run `paragraph-indent` and
    `paragraph-outdent` where B2 registers them, and are off until then.
    *Bulleted and Numbered list* are split buttons now (same ids and names): their arrows open
    Word's libraries as grids of tiles (bullets • ◦ ▪ – ▸ ✓ ⋆ ⋄ →; numbers 1. 1) I. A. a) a. (a) i.;
    None makes the items paragraphs), the list's own format checked, then Change List Level,
    Define New Bullet (a grid of 28 symbols, or a character or LaTeX typed, written only when its
    braces and dollars balance), Define New Number Format (style, text before and after, start),
    Set Numbering Value (or continue the list before), Restart at 1 (a middle item starts a new
    list), Continue Numbering (enumitem's `resume`), List spacing (LaTeX's, `noitemsep`, `nosep`,
    an `itemsep` of your own). A format on paragraphs makes the list with it, on the other kind
    changes the kind with it, in one step. *Written* as enumitem's options
    (`\begin{enumerate}[label=\alph*),start=3]`, `\usepackage{enumitem}` once through
    `App.packageEdits`; `amssymb` for ▪ ▸ ✓ only where no math font package (newtxmath,
    unicode-math and the like, which clash with it) gives its symbols); in a document that labels
    lists another way, that way: the enumerate package's `[(a)]`, paralist's, beamer's (numbers
    only; bullets there are its theme's, said), a list's own `\renewcommand{\labelitemi}`. *Hand
    written forms are Rikuy's own:* a pandoc list's `\def\labelenumi{\alph{enumi})}` and
    `\setcounter{enumi}{4}`, the enumerate package's "(a)", `\setlength{\itemsep}{0pt}`,
    `\tightlist`, the preamble's `\setlist` and `\renewcommand` are drawn, shown checked and
    changed where they are written. *Multilevel list* (Home, a menu): five presets and LaTeX's own
    two, as `\setlist[enumerate,k]{label=...}` lines (an existing one changed in place), the
    caret's whole list made that kind; Define New Multilevel List sets each of four levels (style,
    text, the levels above, or a bullet). *Description list* (the Multilevel menu, the insert
    list, the right click menu). *Sort* (Home): the selected items of a list (all of them with a
    caret) or the selected paragraphs, by the words the page shows, as text, a number or a date,
    ascending or descending, case sensitive or not; the space between them kept, a comment
    ending one keeping its line. *Automatic lists* (A3): "- ", "* ", "1. ", "3) ", "a) ", "(i) "
    typed at a paragraph's start make it a list in that format from that number, joined to the
    list just before where that one goes on so; the typed space is a step of its own, so Undo gives
    back what was typed; `prefs.autoLists = false` switches it off (B11's Options shows it; the
    toast offers it). *Task 29's labelled item* is made a paragraph now, its label kept as its
    first words (a description's term in bold), as are items of nested lists and items selected
    together. *The page draws what TeX prints* (`Builder.listBlock` reads lists through
    `formatOf`): enumitem's labels at every level, `label*`, `start`, `resume` as enumitem counts
    it (the last list that ended, at its level), bullets of the library and typed characters, the
    space between items (nosep, noitemsep, itemsep, `\tightlist`), `\ref` as enumitem gives it (the
    label as written) or LaTeX (`\theenumi` with the levels above: 1a, 1(a)i); a change of the
    preamble's `\setlist` draws the lists again (their labels are in their blocks' keys).
    *Word:* Download Word gives a numbered list the style and start the model read (roman from 4,
    not the letters "iv"; a continued list's 6), and a coauthor's edit comes back as before;
    opened as a new document, pandoc's `\def\labelenumi` and `\setcounter` draw as Word showed
    them. *Also fixed on the way:* an icon button's screen reader name past the window's edge on a
    phone made the whole page scroll sideways by 10 px (`.rb .btn` now holds it). *For agents:*
    llms-full.txt says the keys, the split buttons' arrows by name, the tiles' names, the
    automatic lists and how labels are written; the Help dialog says Tab and Shift+Tab.
    *Security:* the audit skill's quick profile on the changed files (one agent; notes outside the
    repository) found two ways a stranger's preamble or list stalled or crashed the tab, both new
    with this task and fixed with a test: a `\renewcommand{\theenumi}` that names itself grew to the
    fourth power of its length when read (30 names: 7 million characters; 150: the tab gone),
    now stopped at 2000 characters; a label option of 100 000 characters was copied onto every
    item, now drawn as its first 400. Evidence: `npm test` green with `lists.test.mjs` (17 groups:
    reading, Tab and Shift+Tab, several items, depth, paragraphs again, formats of every hand
    written form, labels written where they are, start, continue, restart, spacing, kind, the
    automatic markers, the page's numbers and bullets, sorting, multilevel lines, CRLF, empty
    items, a stranger's source in bounded time), `commands` 12 (the insert list has Description
    list), `word` 56 (55: the list's style, start and continuation to Word and back); `lists.py`
    112 (106 without `dist/tex`: every command a round trip of GAP section 0; with `dist/tex` a
    document of every kind Rikuy writes compiled with pdfLaTeX, XeLaTeX and LuaLaTeX prints the
    labels the page drew); `tabs.py` 116; `ribbon.py` 268; `agent.py` 138; `browser.py` 189;
    `find.py` 76; `outline.py` 59; `word.py` 110; `features.py` 36; `history.py` 39/39;
    `paste.py` 25; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43;
    `pages_check.py` fits; actionlint clean; the model on the corpus 716 of 716. *What moved in
    other suites:* Home's row is about 160 px wider (Multilevel list, Decrease Indent, Increase
    Indent, Sort, two split arrows): at 860 px Home's Insert folds and Editing stays open
    (`tabs.py`), the gallery keeps six tiles to 1536 px and gives way to the list below 1180 px
    (`ribbon.py`), the three downloads are one button at 1000 px; `ribbon.py`'s labelled item
    check now expects the way back. Not done: picture bullets (Word's Picture... in Define New
    Bullet; a `\includegraphics` label is source to write by hand), Word's "Adjust List
    Indents" (enumitem's `leftmargin`), numbering a heading as a list (LaTeX numbers headings
    itself), a nested list's bullet in Word (pandoc's AST has no bullet character); Safari and
    Firefox, by hand.
    *Review (a fresh hostile reviewer on f5bba2e: 3 high, 5 medium, 8 low; each fixed with its
    case as a test, compiled in the page where TeX erred).* H1: List spacing, Multilevel list and
    Define New Multilevel List added enumitem beside the enumerate package or paralist, and every
    `[(a)]` list then failed ("(a) undefined"): there they now write LaTeX's own forms
    (`\setlength{\itemsep}{0pt}` in the list, `\renewcommand{\labelenumii}{...}` in the preamble,
    rewritten where written), Compact (`nosep`) is off with why, and `listPkgs` never adds
    enumitem where the document labels lists another way. H2: Define New Number Format with a
    start took two undo steps; one now (`listFormat`: each change re-reads the list the one
    before left, one edit). H3: OK in Define New Multilevel List without a change rewrote
    `\textbf{\alph*}`, `\S\roman*`, `\ding{43}` and added levels: only rows changed are written,
    a label the dialog cannot show is "Custom (kept)", a level without its own label is LaTeX's
    (∗ and · at levels 3 and 4). M1: the page drew labels TeX does not print; now enumitem's
    `resume` keeps to the group it is in (a list's end saves into the list around it, lost with an
    itemize's group), `series=`/`resume=` name their own counts, `resume*` takes the options too,
    a labelled `\item[x]` steps no number, `\alph` of 0 prints nothing, `ref=` is used, `\ref`
    follows `\theenumi` and the enumerate package's nested "(i)" refers as 1i; Set Numbering Value
    and the dialogs stop at 26 for letters (TeX: "Counter too large"); each against pdfLaTeX in
    the page. M2: a stranger's self naming `\theenumi` under 2000 lists cost 1.4 s a keystroke;
    expansion stops within its pass and `starOf` and `numText` are kept per build (49 ms, the
    same document without that line 34). M3: a typed » or → broke pdfLaTeX's OT1 fonts: a
    symbol's glyph is written as its LaTeX (→ `$\rightarrow$`), another character outside ASCII
    is refused with why on pdfLaTeX unless T1 fonts have it (Latin-1), taken as typed on XeLaTeX
    and LuaLaTeX. M4: OK with nothing changed turned `Step~\arabic*.` into
    `Step\textasciitilde{}\arabic*.`: unchanged fields keep the code, `~` shows as a no-break
    space. M5: Tab and Shift+Tab were swallowed where nothing could be done (a paralist
    `compactitem` in an itemize, a list inside a `center`): the key goes on now, as on the first
    level; the first item and a fifth level still say why. Lows: an automatic list takes the
    `\noindent` before it; a list split by Restart, None or Shift+Tab goes on with the numbers
    (`start=` and `\setcounter` moved on by the items before, as Word renumbers); Tab joins the
    list before when its `\end` line has a comment; Sort writes CRLF in CRLF files and sorts
    paragraphs with a coauthor's comment above them (it goes with its paragraph); no literal
    U+200B left in the code this task wrote (six older ones in `src/model.js` are other tasks').
    `.rb .btn { position: relative }` stays: B2's ribbon relies on it. *Security, again:* the
    quick profile on the changed files found two patterns in the fix itself that backtracked over
    a stranger's text, both fixed before commit with a bounded time test: the dialogs' reading of
    a label (ten `\q` runs took 15 s) and the check that a list ends an item (30 percent signs
    after an `\end`: 16 s, at every move of the caret); `textEngine`'s patterns bounded. Evidence:
    *Phones (the owner's ask):* a phone has no Tab key, so Increase Indent and Decrease Indent are
    the way, tapped (the ribbon's row swiped to them); under a coarse pointer the list buttons and
    their arrows, the libraries' tiles and the dialogs' fields, symbols and buttons are 44 px each
    way, the libraries' grids centred in the bottom sheet; the libraries and dialogs stay inside
    the screen and scroll in themselves, with no side scroll, at 390 and 360 px; automatic lists
    take what an on-screen keyboard sends: the marker and its space at once ("- ", "1. "), a no
    break space, its autocorrect's replacement (a target range ending at the caret), the dash it
    makes of "-" (the source holds `--` or `---`), and an IME's composition committed with its
    space (the composition one step, the list the next, so Undo gives the typed text back).
    `test/lists.py` checks each at 390x844 (light) and 360x740 (dark) with touch, tapping;
    `open_page` in `test/browser.py` takes `touch=True`. The rest of the ribbon's buttons are still
    30 px on a phone (B0's row: one rule for it all belongs there). Evidence:
    `npm test` green with `lists.test.mjs` 24 groups (on main with tasks 45, B6's page and B1's
    Font group merged: `table` 46, `page` 26, `font` 28, `word` 60); `lists.py` 184 (142 on a desktop, nine compiles in the page; 42 on
    the two phones); `table.py` 161; `tabs.py` 116; `ribbon.py` 268; `browser.py` 189;
    `agent.py` 138; `find.py` 76; `outline.py` 59; `word.py` 110; `history.py` 39/39;
    `paste.py` 25; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43;
    `pages_check.py` fits; actionlint clean; the model on the corpus 716 of 716.
42. **B4, Word's styles over LaTeX's own.** Done in the code (branch `wordgap-b4-styles`, on task
    38's frame; GAP rows H59 to H74, A8, D1 to D4). *The gallery's tiles are slots* (`SLOT_EL`,
    `gallerySlots`): Heading 1 is `\section`, or `\chapter` in a report, book, scrbook or memoir,
    and so on down; Heading 4 shows once Heading 3 is in use, as in Word; a tile's right click (or
    the Styles pane's "<name> options") gives Update to Match Selection, Modify…, Select All
    Instances, Remove from Style Gallery and Reset. *Every style LaTeX has* (`styleCatalog`):
    Normal, Title, Heading 1 to 6 (`\paragraph`, `\subparagraph`), Part, LaTeX, Quote,
    Quotation, Verse, Abstract, Theorem, Lemma, Proposition, Corollary, Definition, Example,
    Remark, Proof, the document's own theorem environments and its `\newenvironment` of
    formatting alone; `restyle` takes any to any other by the smallest edit, an environment
    renamed at both ends (a theorem's `[title]` kept, and then only another theorem offered); a
    theorem's `\newtheorem` (with `\theoremstyle{plain}` where another style is in force, and
    amsthm for a style or proof) goes in the same commit unless the preamble, a file it reads, the
    model or the class (llncs, svjour) has it; ntheorem gets its own `\newtheorem` alone. *On
    several paragraphs* a heading, Normal or LaTeX goes on each (from the last back, one edit
    per file, one undo), an environment once around all of them where they follow one another.
    *Numbers:* Unnumbered heading (`\section*`) and Heading numbers off
    (`\setcounter{secnumdepth}{0}`, -1 in a class with chapters; a line of that kind is changed
    where it stands, Rikuy's own goes again whole). *Keys:* Ctrl+Alt+4 Heading 4, Ctrl+Shift+S
    Apply Styles, Ctrl+Alt+Shift+S the Styles pane (no dialog: it stays beside the page and follows
    the caret, a sheet on a phone; on narrow windows the style list's last choices open it and
    Create a Style). "# "
    to "#### " at a paragraph's start make it a heading as a step of its own (AutoFormat headings
    turns it off). *Modify Style* writes titlesec's `\titleformat*` (the format alone) or
    `\titleformat` (shape, rule, number) and `\titlespacing*`, each heading's lines replaced
    where they stand (`src/looks.js`, every scan bounded); LaTeX's own takes them away; a style of
    the document's own gets its `\newcommand` body or `\newenvironment` start rewritten; Normal
    hands over to B1's Font dialog (`font-dialog`) or B2's paragraph dialog by id. *Create a
    Style:* `\newcommand{\name}[1]{\textcolor{…}{\textbf{#1}}}` or
    `\newenvironment{name}{\par\itshape…}{\par}` once, applied to the selection or the paragraph
    in the same step. *Update to Match Selection:* `\section{\textsf{\textcolor{teal}{X}}}` gives
    its formatting to every Heading 1 and loses the wrappers; inside `\keyterm{…}` the same into
    the macro. *The Design tab* (group Document formatting): Themes (five), Style Set (seven
    titlesec sets, "LaTeX" none), Colors (`\definecolor{accent}`; every colour picker that lists
    the document's colours lists it first), Fonts (the headings'; "Text font…" opens B1's Font box
    by id); KOMA-Script by `\setkomafont{disposition}`, memoir and beamer refused with the reason.
    *The page draws it as TeX prints it:* the model reads the looks (`headLook`, KOMA's sans
    serif headings too) and an own environment's look; `\paragraph` and `\subparagraph` run into
    the paragraph after them (a blank line between or not: `runIns`), drawn over the start of its
    first line, which keeps their words' room unseen; `\part` shows "Part I". Word: Heading 4 and 5
    go out as Word's and come back as `\paragraph` and `\subparagraph`, Quotation as a quote.
    The gallery tests moved from `ribbon.py` to `test/styles.py`, every check kept (those whose
    expectation the new styles change rewritten: Heading 4 in the paging, every style in the
    list and More, a quotation shown as Quotation, two quoted paragraphs back to Normal). Not done
    or changed: H63 (Subtitle, Author, Date as styles) not done, the title is still edited where it
    stands; H65's Code (verbatim) left out, a verbatim block is an atom the caret cannot enter, so
    it could not be taken off again from the gallery; H74's Rename not done; D1 writes no
    `\hypersetup` link colour; D2 never changes the class; Set as default is F22 (B12's). The
    security audit's quick profile (notes outside the repository) found three stalls on a
    stranger's long document: six commands' `when` scanning the preamble at every caret move
    (cached per model), Select All Instances querying the page once per block (one walk), and
    "# " reading the whole paragraph at every space (nine characters first); fixed with a timing
    test. Phones: the style list (with the pane and Create a Style at its end), the pane as a sheet
    with 44 px rows and its options always in sight (a heading's Unnumbered heading among them,
    since a phone has no right click), Modify Style and Create a Style fitting and scrolling, the
    Design tab's gallery, all by taps at 390 by 844 and 360 by 740 with no sideways scroll.
    Evidence (on main at a941302, after B6): `npm test` green (`styles.test.mjs` 24 groups, `looks.test.mjs` 6, `word` 58);
    `test/styles.py` 263 (the 76 gallery checks moved from `ribbon.py`, the round trips, the
    phones at two sizes, the long document's timings, and every style compiled in the page with
    pdfLaTeX and LuaLaTeX, the PDF's text read back); `ribbon.py` 193 (268 less the 76 moved,
    one rewritten: a selection over two paragraphs now takes a style); `tabs.py` 116 (Design is
    a tab now); `agent.py` 138; `browser.py` 189; `find.py` 76; `page.py` 139; `outline.py` 59 (the styles'
    heading menu items after the outline's); `offline.py` 54/54; `launch.py` 18/18;
    `deploy_check.py` 43/43; `pages_check.py` fits; the corpus model run 716 of 716 with the same
    unknown commands as before; actionlint clean.

42a. **B4 review: every finding of the hostile review of e6bcad3 fixed, each with its case as a
    test.** *titlesec* only for article, report, book and the ext classes; amsart, llncs,
    elsarticle, revtex, IEEEtran, KOMA-Script, memoir and beamer are refused with the reason, and
    Update to Match and the Design tab follow (H1). Only what changed is written: a heading's last
    `\titleformat` and `\titlespacing` get the arguments of the fields the dialog changed and
    nothing else, so a label's punctuation, a separator, before and after code, glue and
    titlesec's `*4` stay byte for byte, and OK with nothing changed writes nothing (H3, H9); an
    argument that is not there no longer takes the line break with it (H3d). Under titlesec's
    `explicit` option every line is the full `\titleformat` with `#1` (H2). `\usepackage{titlesec}`
    goes in only with a line, and goes again with the last one (H1, L3). *Theorems:* a name made
    by thmtools, tcolorbox, mdframed or llncs' own forms counts as defined, and the model knows them
    as theorems; Proof under ntheorem without its amsthm option is refused (H4). *Create a Style*
    refuses a name TeX, LaTeX, a package the parser knows or the document has, as a command or an
    environment (H5); a new paragraph style is justified, LaTeX's own (M1); Underline asks ulem for
    `normalem` only where ulem is not loaded (M2). *Numbers:* off writes Rikuy's own
    `\setcounter{secnumdepth}` after the author's, on takes only that away (H6); memoir gets
    `\setsecnumdepth{none}\maxsecnumdepth{none}`, and the model knows that its `\mainmatter` sets the
    depth again (M4); the page leaves out a number titlesec's empty label leaves out (H7), numbers
    `\paragraph` and `\subparagraph` where secnumdepth reaches them, and `\part` in an article only
    from 0 (L2, L7); Unnumbered heading is refused on `\section[short]{…}`, which `\section*` cannot
    take (H8). *Run in* only into a paragraph of the same flow, not into a quote, a list or a
    theorem, and not where the preamble or a class of the project sets `\paragraph` on its own line
    by `\@startsection` (H10, M3); the space before is the heading's, so with `\parskip` it stays on
    its paragraph's line (H10). The pane and the narrow list are made again when the document's
    styles change by name (M5). CRLF kept in every line written (L1). Phones: Create a Style's
    Name, the sheet's Close, a style's menu items and the style list at 44 px; a dialog follows the
    window when it shrinks (L4, L5). Home and the up arrow on a run in heading's line go to its
    start, Backspace at its paragraph's start does what it does after any heading (L6); Style Set
    Casual alone defines its accent (L7). Not done: a float between `\paragraph{Lead}` and its text
    (TeX runs in after the float, which it places elsewhere; the page draws floats where they stand,
    so Lead stays before it). Also fixed: the rebase onto B1 had left B1's last `@media` block of
    app.css open, so B4's rules were inside it. Evidence (on main ea60497, after B1): `npm test` green
    (`looks.test.mjs` 9 groups: the review's titlesec lines, explicit, `\\@startsection`; `styles.test.mjs`
    24: numbers off and on keeping the author's line, memoir, CRLF); `test/styles.py` 312 (`review`
    and `review_phone`: one case for each finding, the explicit, thmtools and memoir documents
    compiled in the page, `pdftotext` the judge); `ribbon.py` 193; `tabs.py` 115; `font.py` 272;
    `agent.py` 138; `browser.py` 189; `page.py` 143; the corpus model run 716 of 716, unknown
    commands unchanged.

42b. **B4 verification: what the verifier of 42a found, fixed with its cases.** The names a
    preamble's scan finds (tcolorbox's and mdframed's boxes, `\newtcbtheorem`) serve only the
    "already defined" check; the page draws as theorems only those that are: thmtools'
    `\declaretheorem` with its `name=`, `numbered=no` and `sibling=`, mdframed's
    `\newmdtheoremenv`, llncs' `\spnewtheorem` (`thmMakersIn`), and none of the others is offered
    as a style (V1). Create a Style checks a name against every command name LaTeX's kernel and 88
    common packages define, as LuaTeX's hash table lists them after loading each (`src/texnames.js`,
    9828 names, written by `dev/texnames.py` from a native LuaLaTeX), with the parser's tables and
    the document's own (V2). An `\@startsection` after skip of zero runs in, and `\def\paragraph`
    is read (V3). The narrow list is made again by its styles' values (V4). A `\titleformat*`
    after a full `\titleformat` folds into it when the shape, the rule or the number changes, so
    the full line's label and before code keep applying; numbers off and on give the author's label
    back (V5). Evidence (on main 5f12c07, after B13): `npm test` green (`styles.test.mjs` 25 groups,
    `looks.test.mjs` 10); `test/styles.py` 320 (`verify`: the verifier's cases, its theorem forms
    document compiled in the page); `ribbon.py` 193; `tabs.py` 115; `lists.py` 184; `font.py` 272;
    `eqtab.py` 159; `agent.py` 141; `browser.py` 190; the corpus model run 716 of 716, unknown
    commands unchanged.

42c. **B4: Create a Style's names fetched as the dialog opens, never with the page.** The 9828
    names (41 KB gzipped, for one dialog) were in the page
    bundle every first load paid for, a phone's too. `dev/texnames.py` now writes
    `src/texnames.txt`, the names sorted, a name a line, under one `%` line naming the TeX Live
    they came from (Debian's TeX Live 2023: regenerating from Rikuy's own TeX Live 2026 is noted in
    the script as the thing to do when convenient). `build.mjs` writes it beside the page as
    `texnames-<the first 16 hex digits of its SHA-256>.txt`, in every build (the artifact's too),
    and gives the bundle its name; Create a Style fetches it as it opens (same origin, so
    `connect-src 'self'` allows it; under the installed app by its version's address, as
    `git.js`), once per page. The dialog works at once: the check of the parser's tables and the
    document's own runs while typing, LaTeX's list is applied when it arrives, and OK before it
    has is refused saying so; a list that cannot be fetched is said so with the reason at OK, and
    fetched again. Named by its hash it is the service worker's kind `i`, kept at install apart
    from the version, and `_headers` caches it for a year as immutable. Evidence (on main 5802352,
    after task 52): the hosted page's script 1326 KB before, 1196 KB after; `index.html` 1552197
    bytes before, 1418789 after, gzipped 515558 and 473258 (42 KB less on every first load); the
    artifact's `rikuy.html` 2878 KB before, 2748 KB after; the list itself,
    `texnames-d2369a53e8e5db5c.txt`, 134674 bytes, 41387 gzipped, fetched only by Create a Style.
    `npm test` green (`native.test.mjs` 43, `deploy_check.py` 45); `test/styles.py` 333
    (`lazy_names`: no part of the page, nothing fetched before the dialog, OK refused while the
    list is held back and the check applied when it comes, fetched once, a 404 said and fetched
    again); `offline.py` 58 (kept at install as kind `i`, Create a Style's list offline, the
    artifact's build ships it and fetches it); `agent.py` 141; `browser.py` 193; `tabs.py` 115.

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
44. **B6, the page: Word's Layout and page background, headers and footers, as LaTeX.** Done in
    the code (branch `wordgap-b6-page`), GAP.md's rows I3, I24 to I29, L1 to L9, L16, L18, D7 to
    D9 and F13. *Layout.* Margins (Normal, Narrow, Moderate, Wide, Mirrored, Custom), Orientation,
    Size (Letter, Legal, A4, A5, B5, Executive, A3, any size), Columns (one, two, three, More
    columns: the number, the space, a line between; the whole document, the selected paragraphs
    or the caret's multicols), Breaks (page, column, text wrapping; next page, continuous in
    multicols, even and odd page), Line numbers (continuous, each page, each section, count by),
    Hyphenation (automatic, none, manual `\-`, the exceptions), the Page setup dialog (margins,
    gutter, mirrored margins, orientation, paper, the header's and footer's distances, the
    vertical alignment of the caret's page), and the Document setup group (class, base size, two
    sided). Everything is written once and where it stands (`src/pagesrc.js`, on strings): a
    hand written `\geometry{...}`, the `\usepackage[...]{geometry}` options or the class's
    `a4paper` are edited in place, geometry loaded in a file the preamble reads gets a
    `\geometry` line of its own; a paper size in the class's options changes there with geometry
    loaded beside it, since pdfTeX takes the PDF's sheet from geometry or hyperref (a class option
    alone leaves TeX Live's A4: measured). *Insert.* Blank page and Page break (Ctrl+Enter; in a
    table's cell Ctrl+Enter still adds a row, the table's command takes the key there), Header,
    Footer and Page number (top or bottom, left, centre, right; Page X of Y with lastpage; in the
    text; their format and first number; removed). The header and footer are typed on the page:
    a double click in a page's top or bottom margin opens their three places as fields and the
    Header & Footer tab (Date, Page number here, Different first page, Different odd & even
    pages, Position, Close); fancyhdr is turned on once (`\fancyhf{}`, no rule under the header,
    the plain style's page number kept at the foot), a place written in place, `& % #` escaped,
    one step of history for each run of typing. *Design.* Watermark (DRAFT, CONFIDENTIAL, ...,
    your own text, size, angle, colour; draftwatermark, `\SetWatermark...` read too), Page color
    (`\pagecolor`, the colour picker's names), Page borders (a TikZ rectangle on the shipout
    hook, read back from that form). *File.* Print PDF (Ctrl+P, from anywhere): TeX's PDF drawn
    page by page for the printer at its own size, the browser's print dialog for printer, pages
    and copies; a frame that may not print downloads the PDF. *The page shows it as TeX prints
    it* (`src/layout.js`, B6's alone): the paper by name or size, turned for landscape; the text
    block worked out as geometry does (a margin alone keeps the other at its default, 0.7 of the
    paper where nothing says, 1:1 across and 2:3 down, 2:3 inside to outside two sided;
    includehead, includefoot, bindingoffset, headsep, footskip) or as the standard classes do
    (their size files' sums, two sided margins 0.4 and 0.6 of what the text leaves),
    `test/page.test.mjs` holding 25 cases to TeX's own numbers; even pages with the outer margin
    left; two columns and multicols drawn as columns (filled one after another, multicols
    balanced where it ends, the title and `figure*` across, `\columnbreak`, the rule between);
    headers and footers in their three places with `\thepage`, LastPage, `\leftmark` and
    `\rightmark` as fancyhdr sets them, the title's and a chapter's page plain, `\pagestyle`,
    `\thispagestyle`, `\pagenumbering` (i, ii, iii) and `\setcounter{page}` where they stand;
    `\cleardoublepage` with its blank page; `\null` between breaks an empty page;
    `\vspace*{\fill}` what the page has left; line numbers beside each line (the last column's
    in the right margin); the watermark under the text; the page's colour and border; no word
    broken under hyphenat's none. *Word, both ways* (`src/pageword.js`, `src/wordpage.js`):
    paper, orientation, margins, gutter, mirrored margins, the whole document's columns, the
    header and footer in three places (tab stops) with PAGE, NUMPAGES as fields, odd and even
    ones, a first page of its own, the numbers' format and start, line numbers, the page's
    colour and border go into the .docx's section and settings in Word's order; a Word file's
    come back as the same LaTeX (its header was "not kept" before). The watermark does not go to
    Word (a shape there): the export says so. *Keys and names that changed:* Ctrl+Enter outside a
    table is a page break; Ctrl+P prints TeX's PDF (the Preview button shows it, as before);
    Ctrl+Shift+Enter is a column break: in Help and llms-full.txt. The File, Design and Layout
    tabs show now; the Layout tab's last group is "Document setup" (a group "Document" took the
    page's own name "Document" from agents), the Page setup group's launcher "Page setup dialog"
    and File's Print "Print PDF" (each group folds into a button of its name). *Security:* the
    audit skill's quick profile on the changed files (notes outside the repository) found one
    stall a stranger's preamble could cause: `\setlength` followed by 200 000 spaces backtracked
    for about 40 s in the reader of `\columnsep`; now a scan (18 ms), with a test. Evidence: `npm
    test` green (`page` 14 groups, new; `word` 56 groups, one new: the page's set up to Word and
    back, the rich fixture's header kept), `test/page.py` 82 (new: every control by its menu, the
    round trip rule on Size, Margins, Blank page, Two sided, Different first page with hand
    written forms, the page drawn as written; with `dist/tex` the PDF compiled in the page has A5
    landscape's MediaBox by pypdf, the running head and line numbers by pdftotext, as many pages
    as the page, and Ctrl+P draws its pages for the printer), `tabs.py` 104, `agent.py` 132 (the
    Header & Footer tab's controls now reached too), `ribbon.py` 267, `browser.py` 189,
    `word.py` 111, `scripts.py` 302, `widgets.py` 60, `stress.py` 9, `features.py` 36,
    `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py` fits,
    actionlint clean, the model on the 716 document corpus 716 built. Not done, and why: Columns'
    Left and Right (no standard package flows text into columns of unequal widths; paracol's do
    not flow), landscape for some pages only (pdflscape), a picture as watermark, art borders
    (pgfornament), Word's columns for part of a document (sections), suppressing line numbers
    for one paragraph, Document info in the header. One commit, not four: the steps share
    `src/layout.js`'s plan and chrome.

    *After the hostile review of b1ccf0f* (5 High, 7 Medium, 9 Low; each fixed with the reader's
    case as a test, compiled in the page and held against what the page draws wherever it is
    about TeX: `test/page.py` compile_pdf). H1: the header's field writes only text whose braces
    pair and that does not end in a lone backslash (marked invalid and saying why meanwhile, kept
    as the source had it if closed so); what is typed has `& % # $ _` escaped and `^ ~` as
    `\textasciicircum{}` and `\textasciitilde{}`, the source's own text (its `$x$`) left alone.
    H2: a header argument is read as TeX reads it (comments with their line end, line ends as
    spaces) for the page and the field, and written back as the smallest edit around its
    comments; a change that would take a comment away is refused, saying so. H3: the style the
    pages take is drawn, `\fancypagestyle{name}[base]{...}` over fancy's own (fancyhdr's
    defaults as `\f@nch@initialise` sets them, one and two sided), and a header typed goes inside
    that style's definition; KOMA-Script's scrlayer-scrpage is read and written in its own
    commands (`\ihead` ... `\ofoot`, `\lohead` ..., the plain style's optional arguments, the
    clear commands), and a KOMA class gets scrlayer-scrpage rather than fancyhdr. H4, M7: where
    the class lays the page out, Size writes the class's option and `\usepackage[pass]{geometry}`
    beside it only where nothing else sets the PDF's sheet (A4 needs none); orientation the
    class's `landscape` the same way; geometry's pass ignores every key, so the header's
    distances, a paper the class does not know (A3, any size) and margins turn the layout to
    geometry's with the text block (or, for a new paper, the margins) pinned in points, so
    nothing else moves; the model reads bare geometry (its 0.7 defaults) and pass (the class's
    layout). M1: the sheet drawn is the PDF's: A4 upright unless geometry, hyperref (not
    `setpagesize=false`), typearea, a KOMA class, memoir, beamer, IEEEtran, elsarticle or acmart
    sets it (amsart, revtex, llncs measured A4), the class's text block on it from the top left;
    margins written on such a page keep that sheet (`a4paper` beside them). H5: Columns never put
    a float inside multicols: the environment ends before each figure or table and begins again
    after it, the parts read back as the body's columns and taken out again to the byte; a float
    a document has inside multicols is drawn as left out of the PDF. M2: `\newpage` in multicols
    ends the page; in a two column document Page break and Blank page write `\clearpage`. M3:
    Ctrl+Enter inside `\textbf{...}`, `{\bfseries ...}` or `\textcolor{red}{...}` closes the
    groups and opens them again around the break (at a group's edge it goes outside); none in a
    footnote, a box, a caption or a minipage (disabled, saying why). M4: a book, scrbook and
    memoir take the headings style: the running head at the top, nothing at the foot, blank
    pages with their head, the title page empty in report and book; the marks as the classes and
    fancyhdr make them (CHAPTER 1. ONE, 1.2. SECTION, 2 SECTION with an em between, subsections in
    their case); Word gets the head. M5: a multicols environment's paragraphs are blocks of their
    own, so typing redraws one paragraph: 300 KB in two columns, the layout's median per key 32
    ms early and 15 to 18 late against main's 616 to 740; a plain document 22 to 31 against
    main's 20 to 28, within its noise (marks are worked out only where a header shows one). M6:
    Even and Odd page are `\clearpage` and `\ifodd\value{page}\hbox{}\clearpage\fi` (with
    `\else` for odd), drawn so, in one and two sided documents. Lows: `\pagenumbering{gobble}`
    (in the body or the preamble) prints no number, `\addtocounter{page}{n}` counts; the class
    menu edits the class TeX reads, not a commented line before it; beamer's Margins, Size,
    Orientation, Columns, Page setup, header and footer are off, saying why; CRLF files get CRLF
    lines; a dialog's steps are as many edits as places changed, each the smallest; a plain page's
    footer comes back from Word as LaTeX's plain style, no fancyhdr; Print draws each page at the
    PDF's own size, one picture at a time as a blob (a long document says how far it got, Escape
    stops it, nothing stops silently at 500); a blob: frame of the PDF itself would need
    `frame-src blob:`, which the page refuses on purpose (`src/widget.js`), so it is not used;
    columns leave room for their footnotes. *Security:* the quick profile on the changed files
    found two more stalls of the same kind (the caret's paragraph read for Ctrl+Enter, a preamble
    of thousands of `\fancypagestyle` lines), bounded, with tests. Evidence, on main with task
    43 (B5) merged: `npm test` green (`page` 25 groups, `preamble` 18, `word` 56, `find` 25),
    `test/page.py` 115 (19 of them compiled in the page), `tabs.py` 116 (B5's fold sweep from 390
    to 1920 px on every tab, Layout, Design, File and Header & Footer with B6's commands among
    them), `agent.py` 138, `ribbon.py` 268, `browser.py` 189, `word.py` 111, `scripts.py` 302,
    `widgets.py` 60, `stress.py` 9, `features.py` 36, `find.py` 76, `outline.py` 59, `share.py`
    46, `history.py` 39/39, `paste.py` 25, `files.py` 68, `offline.py` 54/54, `launch.py`
    18/18, `deploy_check.py` 43/43, `pages_check.py` fits, actionlint clean, the corpus 716 of
    716.

    *After the verifier of PR 19 (c08fc02)*, each case compiled in the page against what it draws
    (`test/page.py` verifier_pdf). The PDF's sheet: TeX Live's PDF is A4 only where nothing loaded
    sets `\pdfpagewidth`, and far more does than the review knew: the graphics and colour drivers
    set it (graphics, graphicx, color, xcolor, so TikZ and most of what draws), as do hyperref,
    geometry, typearea, crop, memoir and `\DocumentMetadata`. `dev/media_probe.py` measured 290
    classes and packages in this TeX Live (25 classes, the corpus's packages and the common ones);
    the sheet stays A4 only where every class and package loaded is among the classes and the 195
    packages measured to leave it alone (`NO_MEDIA_CLASSES`, `NO_MEDIA_PACKAGES`), any other being
    taken to set it, and the document's PDF, once made, gives the page its own first page's sheet
    for that set up (the class, the packages and their options: `mediaKey`), so a package nobody
    measured is drawn right after the first compile. KOMA's classes and typearea take A4 as their paper where none is
    given. Header to text and Text to footer, where the class lays the page out, write `\headsep`
    (with `\topmargin` moved the other way) and `\footskip` themselves, so amsart, revtex,
    KOMA's and llncs's own text block stays put (geometry with article's numbers moved them). Even
    and Odd page in two columns: no band of nothing, no extra blank page. A two sided book's Page
    number: the number goes where asked on the side where that place is free and on the other
    side of the page where a running head holds it, so the heads stay; Remove takes out the
    numbers' own slots only. Print: Escape is heard from the moment Print is asked for and sends
    nothing to the printer; the pages' pictures share a budget of 150 million pixels, and a PDF
    that would get under 96 dpi is downloaded to print from a PDF reader, saying so. Ctrl+Enter
    never cuts a macro of the document's own (`\pair{Key}{value}` printed Key twice): the break
    goes to the paragraph's nearer end; in a group cut, the declarations in force (`\bfseries`,
    `\color{red}`, `\large`) open its other half too. A space right after a header argument's
    brace, which TeX prints, is kept, and the page draws no space after a command's name, as TeX
    reads none (`\thepage of` prints 1of). Opening the header scrolls its field into sight (one
    out of sight took no keys). Also: a report's or book's title (and the titlepage option) on a
    page of its own, the next numbered 1 again in a one sided document; multicols' optional
    argument set across before the columns (and kept when One takes the columns out). Not done:
    `\markright` and `\markboth` written by hand (myheadings) are not drawn. Evidence: `npm
    test` green (`page` 26 groups), `test/page.py` 139 (25 new, compiled in the page),
    `tabs.py` 116, `ribbon.py` 268, `browser.py` 189, `agent.py` 138, `word.py` 111,
    `scripts.py` 302, `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43,
    `pages_check.py` fits, actionlint clean, the corpus 716 of 716.
44a. **The page commands' answers read once for each text.** Follow up of task 44, found by B4's
    timing on a long document: Layout's and Header & Footer's `when` and `on` (Two sided,
    Different first page, odd and even pages, Line numbers, Hyphenation, Page setup, Watermark and
    the rest) each read the main file again at every look at the caret (`preambleEnd`,
    `classPage`, `firstPageStyle`), about 100 ms a look with a 167 000 character preamble and 3000
    paragraphs. `src/cmd/page.js` keeps each read for the file's text it was made from (`once`):
    pure functions of the text, so the answers are a fresh read's, and an edit changes them at
    once. Evidence: `page.py` 143 (four new in `long_document`: every command's `when` and `on`
    together 1 ms there against 102 ms before, the same answers as a fresh read, twoside and
    `\thispagestyle{empty}` pressed at once, no preamble disabling them); `npm test` green;
    `tabs.py` 116; `agent.py` 138.

45. **B7, tables as in Word.** Done in the code (branch `wordgap-b7-table`), rows I4, I5, I7, I8,
    T1 to T5, T7 to T20 and C2 of the gap list (task 38). *One reading of a table.*
    `src/table.js` reads tabular, tabular*, tabularx, tabulary, longtable, array and xltabular
    once: the specification as pieces (l c r, p m b, X, S, w, D, letters `\newcolumntype` made
    with their arguments, `@{}`, `!{}`, `>{}`, `<{}`, `*{n}{…}`), each row as its rules, its
    cells between their `&` (not one in braces, a nested environment, a comment or `\verb`), its
    `\\` with a star or `[2pt]`, `\tabularnewline`, longtable's `\kill` and `\endhead`;
    `\multicolumn`, `\multirow`, `\rowcolor`, `\cellcolor` at a cell's start; CRLF kept. Every
    piece is a range, so the table put back together is the same bytes (all 222 readable tables
    of the corpus; the 223rd is half of a macro), and every operation is small edits there, in
    the table's own style: a row inserted is one unit like its neighbours' (in an `\hline` grid
    with its own `\hline`; in booktabs above `\midrule` from the header, under it from the first
    body row, above `\bottomrule` from the last), a column is one letter and one `&` a row
    (`\cline` ranges and `\multicolumn` counts follow). *The commands* (`src/cmd/table.js`, all
    from the registry): Insert › Table with Word's grid of ten by eight (mouse and keys) and
    Insert Table…, Convert Text to Table…, Table from Data File… (`\csvautobooktabular`, drawn
    on the page from the project's .csv); Table on Home inserts a two by two table as before, now
    booktabs with a header row (booktabs loaded once). Table Design: Header Row, Total Row,
    Banded Rows (`\rowcolors`), First and Last Column (`>{\bfseries}`), Banded Columns
    (`>{\columncolor}`); the looks Plain, Table Grid, Booktabs, Horizontal Lines, Outside Borders
    (the one a table has shown pressed, hand written ones too); Shading (`\cellcolor`, whole rows
    `\rowcolor`; xcolor's table option, by `\PassOptionsToPackage` where TikZ loads xcolor
    first, dvipsnames with a colour of its names); Borders (ten, as rules `\hline`, `\cline`,
    booktabs' rules and bars; the caret alone means the whole table, a selection its cells),
    Pen Weight (`\arrayrulewidth`), Pen Color (`\arrayrulecolor`). Table Layout: Select Cell,
    Column, Row, Table (shown as a block of cells), Properties… (full width, alignment, rows'
    height, the column's width, vertical alignment), Insert Caption (a float made around a table
    alone), Delete (Cells… shifting left or up, Columns, Rows, Table), Insert above, below, left,
    right, Merge Cells (`\multicolumn`, `\multirow`, both; the rules between merged rows cut to
    `\cline`/`\cmidrule`), Split Cells (and the whole rule back), Split Table, AutoFit
    (contents, window as tabularx, fixed `p{}` at the widths the page draws), Distribute Rows and
    Columns, Word's nine alignments (a column's letter when all of it is selected, else
    `\multicolumn{1}{c}{…}` with the column's bars, gone again at the column's own; `m{}`, `b{}`,
    `\multirow[t]`), Text Direction (`\rotatebox{90}`, `{270}`, level), Cell Margins…
    (`\tabcolsep`, `\extrarowheight`), Sort… (text or numbers, the header row kept, the rules and
    `\\[…]` where they were), Repeat Header Rows (a longtable with `\endhead`, the float's
    caption into it, and back), Convert to Text… The settings go in the table's float, or in a
    group made around a table alone, which the page draws as the table. Tab in the last cell
    adds a row; Ctrl+Enter in a cell adds one under it (the command's key, rank 1: outside a
    table it is B6's page break). The right click menu in a cell: Insert below, above, left,
    right, Delete and AutoFit (their menus), Merge, Split, Distribute Columns, Text Direction,
    Properties, Insert Caption. Every dialog command takes its fields as arguments too
    (`rikuy.api.run("table", {rows: 3, cols: 4})`, llms-full.txt). *The page* draws merged rows
    (rowspan), turned words, banded rows, bold and coloured columns, `m{}` and `b{}`, a cell of
    nothing (`&&`) with a place for the caret, and puts what is typed in an empty cell after its
    line's end (`\nx &`, `& x &`). *Word:* a `\multirow` goes out as Word's merged cell
    (vMerge), and comes back as `\multirow`. *Security:* the audit skill's quick profile on the
    changed files (notes outside the repository) found five ways a stranger's document stalled
    the tab, all fixed with a bounded-time test: the model's `*{3000000}{c}` (pre-existing, 2 s
    a build; columns now stop at 1000), a thousand nested or unclosed tabulars around the caret
    (3.6 s a look; now the nearest first, 4 M characters of work in all), lengths, text to table
    and turned cells read with patterns that went quadratic on runs of spaces. Evidence: `npm
    test` green (`table.test.mjs` new, 27 groups: every operation and its inverse, the corpus's
    tables put back and 4814 rows and columns in and out again byte for byte; `commands` 12,
    `word` 56, one new: merged cells both ways), `test/table.py` 130 (new; the round trip rule
    on 17 commands with their hand written forms; the compile in the page of booktabs,
    `\multicolumn`, `\multirow`, `\rotatebox`, `\cellcolor`, `\rowcolors`, tabularx, `m{}` and
    longtable with `\endhead`, every word in the PDF), `tabs.py` 104, `ribbon.py` 267 (Table's
    expected source now booktabs), `browser.py` 189, `agent.py` 132, `scripts.py` 302, `word.py`
    110, `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py` fits,
    the corpus model run 716 of 716 with the same unknown commands, actionlint clean; screenshots
    at 1920, 1366 and 390 px, light and dark, looked at. Not done: T4's border painter (it is
    Word's Draw Table pen, which the gap list skips as I6: borders come from the Borders menu);
    T7's alt text (a table has no LaTeX field for one; its caption is what a reader and tagging
    get); T14's Height and Width boxes are in Properties…, not on the row (the one row of the
    ribbon has no room); shading and turned text do not go to Word (pandoc's table has no field
    for them); Safari and Firefox, by hand.
    *Review* (a fresh hostile reviewer: 13 high, 7 medium, 6 low; each fixed with its case as a
    test, and where TeX had stopped, compiled in the page): Rikuy's own booktabs table is no
    grid (a grid has the same rules under every row and never booktabs' rules), so Tab in its
    last cell, Insert below and Delete Rows keep `\bottomrule` and one `\midrule`; a new row
    copies no comment, only the line's indent; a merged cell's `\cellcolor` stands in its
    `\multicolumn`'s text (shading it, merging a shaded cell, aligning one); one cell aligned in
    a `p{}` column loads array, keeps a `>{\bfseries}`, and a number column (S, D) keeps its
    letter; AutoFit Window and Distribute Columns make tabular* and tabulary a tabularx as wide;
    Repeat Header Rows off takes `\endfirsthead`'s head once at the top and `\endlastfoot`'s
    foot (else `\endfoot`'s) at the end (pandoc's tables from Word), on carries the float's
    settings into a group, its label, its alignment as `[l]`/`[r]`, a head other than
    `\begin{table}[h]` into a comment, gives the float back byte for byte, works only from the
    first rows (Word's rule) and says why in two columns; a caption in a minipage or subtable
    goes in it (`\captionof` and caption outside a float); xcolor is loaded where only its
    options were passed (listings, colortbl, tabularray alone); settings in `\resizebox{…}{!}{…}`
    stay in its argument and its braces stay; Convert Text to Table cuts outside braces and
    math and puts a comment after the row's `\\`; column operations on `*{n}{…}` keep its bars
    and `@{}` and keep a star they do not touch; Table from Data File writes `[respect all]`
    and T1 where the document names no encoding (OT1 prints `_` as a dot accent), and its file
    joins the project only with Insert, in the same step; the page and Word under a cell merged
    both ways, Tab, Select and the painted block across a table's pages, Sort on a longtable,
    Split right after Merge byte for byte, one CSV in many tables read once (69 s to 68 ms), the
    look named Box. Kept: a new row's leading space (` &  \\`) is the first cell's place, which
    typing replaces (`Name &  \\`). The audit's quick profile on the changed files (notes
    outside the repository) found one stall, a star written out with a pattern over its whole
    text each repetition (156 ms a look), fixed with a bounded-time test. Evidence:
    `table.test.mjs` 41 groups, `test/table.py` 150 (20 new, two compiles in the page).
    *Verification* (a fresh verifier of the review round: 25 of 26 fixed, H7 partial, and new
    faults): Repeat Header Rows on a float with settings writes them in a group the page now
    reads as the table (`\small` and its kin a table's setting, drawn at that size; a label
    beside the group); Table from Data File adds T1 for pdfLaTeX only (the engine read as
    tex/engine.js's pickEngine reads it: the preview's choice, a magic comment, fontspec,
    polyglossia, unicode-math, babel's onchar, `\babelfont`, Lua's packages), and not where a
    file the preamble reads loads fontenc or fontspec; two columns are found in the project's
    .sty and .cls (acl.sty's `\maketitle`), the files the preamble reads and an `\input` before
    the table; a float's head on two lines becomes one in the comment, a center environment is
    centring, its comments (review comments among them) go with the table both ways, wraptable
    comes back; the cells are indexed once a table (a selection painted at 3000 rows: a second
    before, milliseconds now); Insert Caption goes to a subtable's or minipage's caption, and a
    commented `\begin` opens nothing; a grid may have one richer rule anywhere (a double one
    under a header, two rows too) and rule lines' comments do not count or get copied; deleting
    rows where two rules would meet keeps the table's top or bottom rule. Evidence:
    `table.test.mjs` 46 groups, `test/table.py` 161 (11 new: the page's drawing, Off, the
    engines, the .sty, the timing; two more compiles in the page, the grouped longtable and a
    XeLaTeX document with its data table, every character in the PDF).
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
    it was while typed in; every ribbon button holds its screen reader name
    (`position: relative`: absolute names past a phone's edge widened the page by the row's
    length). The preamble's lines go through `usePackages` with the files the preamble reads
    (`App.preambleOthers`), as B0's review asked. B0's tests changed
    only where B1 changes what they saw: `\uline` for `\underline`, the Format Painter as Home's
    first control, the right click menu's Font Settings, and the widths at which the Styles
    gallery has room (see the review's paragraph below for the widths on B5's fold rule). *Security* (the audit skill's quick profile on
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
    *The hostile review of a20db3f* (6 high, 7 medium, 8 low; each fixed with the reader's case
    as a test, `test/font.test.mjs`'s "review" groups and `test/font.py`'s `review`). A format comes off a part as Word takes it off: a group of declarations split
    keeps its other declarations and, where it is an argument (`\footnote{\color{red} ..}`,
    `\section{..}`, `\textbf{..}`), its braces, so no word leaves its command (H1, L8); Automatic,
    No Color and a toggle off take the kind off the selection alone, `\textbf` included (M6); an
    end of the selection inside another format splits that one too. A format goes on in whole
    pieces: a selection over a brace, cells, items, environments or paragraphs gets a wrapper on
    each, LaTeX paragraphs and displays none, the mark kept on its line (M3, M4); ulem's lines
    close around a `\footnote`, `\marginpar` or `\todo` (H4: the document that stopped TeX with
    seven errors compiles in the page). A family on a declaration that is an argument stays one
    (`\textbf{\rmfamily ..}`, H2). Change Case changes only letters the page draws that the
    source gives as letters of words: no math, label, column spec, reference, glossary or
    language key, code, picture, footnote behind its mark or LaTeX paragraph; `\ss` becomes
    `\SS`, an accent's letter its capital (H3). The Font dialog keeps a main font Rikuy does not
    list (H5); a font package it does not list (fourier, libertine, stix2, mathdesign, ...) is shown
    by its name and replaced by the font chosen, helvet and courier stay with another roman (H6,
    L5). Increase and Decrease Font Size step from the run's size (M2); at a caret inside a word the
    size box, the font box and both steps act on that word, never the class: the document's font
    and size are the Font dialog's Set As Default (M7). An ulem the document loads keeps its
    options, soul's `\hl` or one an `\input` file defines is never redefined and takes no
    colour (M5); CR LF files get CR LF lines (L4); the class's size changes only its option's text,
    comments kept, an explicit `[10pt]` kept, beamer's own 11pt (L3). Clear All and a toggle over
    a whole document clear every wrapper, 2000 at a time in one pass each (300 KB: 0.1 s, L1).
    Character Shading writes `\hl[lightgray]` over words, which breaks across lines (L2); Word
    gets its own highlight on the run for its sixteen colours and the reading of a phonetic guide
    in brackets, said among what it loses (L6; a .docx from Word without Rikuy's data still comes
    in without highlight, sizes and shading: pandoc's reader has none); the boxes keep the
    selection on Enter, apply on Tab and open their list on the current value (L7). M1: the
    ribbon's one fold rule is B5's (task 43, rebased onto 49e49eb); B1 keeps for its Font group
    Word's two rows above 860 px and, below 861 px, Bold, Italic and Underline first in the row
    beside the group's button, whose menu has the rest (one row of all of it was 640 px), also
    when the group is folded; B5's sweep (every tab, 390 to 1920 px, with and without extra
    commands) passes with no new exception. Home's Insert group, whose commands the Insert tab
    has too, is `spare` (`src/ribbon/order.js`): it folds first, into one icon button whose menu
    has its commands by their names, before any name drops or tile goes, and the names come after
    the tiles (in their chain, so a tile given back never costs them). So from 1440 to 1920 px Home
    shows every other name and all six tiles, at 1366 px four, at 1280 px three with the names, and
    the gallery stays, three tiles, down to 1024 px; the style list from 1000 px; Editing folds
    from 700 px. The two rows take 182 px more than B0's three buttons; at 1920 px the Insert
    group with its names (559 px) does not fit beside them (123 px over) and stays folded, leaving
    438 px empty. `tabs.py`, `ribbon.py`, `find.py` and `agent.py` reach its commands through its
    menu.
    Evidence on main 49e49eb with B5: `npm test` green (`font` 25 groups, `word` 57), `font.py`
    199 (with `dist/tex`), `tabs.py` 115, `ribbon.py` 268, `agent.py` 138, `browser.py` 189,
    `word.py` 110, `scripts.py` 302, `find.py` 76, `outline.py` 59, `offline.py` 54/54,
    `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py` fits, actionlint clean, the
    corpus model run 716 of 716 with the same unknown commands.
    *The verifier's last round on 921d945* (each with a test, `font.test.mjs`'s "verify" groups and
    `font.py`'s `review2`): Change Case starts a word and a sentence at each cell, row, item,
    paragraph and line break the page draws, and in the source at `&`, `\\`, `\item`, headings,
    environments and blank lines (a single line end in a paragraph is a space); one edit for one
    source however many letters the page draws from it (`\SS`, which the page now draws, as do
    `\dh`, `\th` and `\ng`); Greek's final sigma; the page read only in the blocks the selection
    touches, each character's place summed in the loop (300 KB after Ctrl+A: 100 ms to read, 170 ms
    to work out; the rest of the second is the page drawn again). A heading and a file read in
    (`\input`, `\include`, `\subfile`) stay out of a wrapper whole (`\uline{\section..}` stopped
    TeX; the review's document compiles in the page). Select All over a document that reads in
    files formats the main file's words and every file the page draws, in one step of undo, and
    stays selected. Increase and Decrease Font Size at `\Huge` and `\tiny` say so; Home fits at
    521 px with every group folded; a selection that would part a letter from its accent or vowel
    sign says that.
    *With B7's tables and B6's page set up* (rebased on main a941302; extsizes' measures, `ext`,
    kept inside B6's geometry in `src/layout.js` and its class options in `src/model.js`): a block of cells (Select Column, Row or Table,
    a drag from one cell into another, which B7 shows as a block) takes a format in its cells
    alone, whole, as Word's does; before, Bold after Select Column reached the cells the browser's
    selection runs through (seven of a three by three table, not three). `blockCells` reads the
    block's cells from B7's `tableHere`; each cell is formatted on its own text (a cell is a group
    of its own in TeX), the last first, all in one step of undo; a toggle chooses once for the
    block (on in every cell takes it off), Change Case reads the block's characters as one text,
    and Bold shows pressed when every cell is bold. Clear All Formatting on cells leaves the
    `center` around the table. A column of 3000 rows takes Bold in about a second (the whole text
    read back from each cell took 6.5 s); each cell's state is read in the cell alone, and a block
    of more than 5000 cells is refused with a toast (a stranger's table may hold 100 000). A toggle now reads every part of its selection to choose
    (a button's look still reads 400), so Bold again over a table or a document of more than 400
    parts takes the bold off; the Font dialog's boxes force what they say (Bold ticked over
    `\textbf{one} \textbf{two}` took their bold off). Each with a test: `font.py`'s `cells`,
    `font.test.mjs`'s "with tables" group.
    *On a phone* (asked for by the owner; `font.py`'s `phones`, at 390 by 844 and 360 by 740 px
    with a touch screen and taps): under `pointer: coarse` every control of the Font group, the
    Format Painter, the boxes, a menu's items, the colours and the Font dialog's fields are at
    least 44 px each way (the colours in as many columns of 44 px as the screen holds); on a phone
    the font and size boxes stay in the row after Bold, Italic and Underline, so a size is typed
    with the on-screen keyboard; a sheet (a menu, a list, a dialog) opens above that keyboard,
    whose height the visual viewport gives (`--vk-h`); the Font dialog scrolls; the Format
    Painter paints the word tapped, or words selected by a long press once the selection rests;
    Clear Character Formatting (Ctrl+Space) is in More Font Effects, so every key of the group has
    a control a finger reaches; Bold by a tap leaves the words selected and typing goes on in
    them; no sideways scroll. Screenshots at 390 px, light and dark, outside the repository.
    Evidence on main a941302: `npm test` green (`font` 28 groups, `word` 59, `page` 26),
    `font.py` 272 (with `dist/tex`), `tabs.py` 115, `ribbon.py` 268, `agent.py` 138, `browser.py`
    189, `table.py` 161, `page.py` 139, `find.py` 76, `outline.py` 59, `scripts.py` 302, `word.py`
    111, `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py` fits,
    actionlint clean, the corpus model run 716 of 716 with main's unknown commands.
51. **B13, Word's equation tools.** Done in the code (branch `wordgap-b13-equation`, on task
    38's frame; GAP rows E1, E2, E4, E5, E6, I42, C4). *The Equation tab* comes with an equation's
    field (in front for a new one, as Word brings it; shown, not brought forward, for one clicked)
    and goes with it: Tools (Equation gallery; Numbered, whose arrow has numbered, unnumbered,
    aligned, gathered and multline, each numbered or not; Display), Word's symbol groups (Basic math,
    Greek letters, Operators, Arrows, Relations with their negations, Sets and logic, Geometry; 336
    symbols, each item named by its LaTeX and what it is called, "\pm plus or minus") and Word's
    eleven structures (Fraction, Script, Radical, Integral, Large operator, Bracket, Function,
    Accent, Limit and log, Operator, Matrix; 158 templates drawn by KaTeX, their slots grey
    squares). What is picked goes into the field at its caret (MathLive's `insert` in the field's
    dialect; a template's first slot takes the selection, as Word's typing does; in the LaTeX box,
    where it has the focus, as text with the caret in the next slot), so into the source, and the
    field keeps the focus: the menus float beside the ribbon and are no popover of the app's (the
    field is that one), a press on the tab, its row of tabs or a menu does not close the field,
    Escape on the tab or in a menu goes back to it, a folded group of the tab opens the tab's own
    menu. *Display, Numbered and the right click menu* (a right click on an equation, or Backspace
    beside it and Shift+F10: Edit equation, Change to inline or display, Change to numbered or
    unnumbered, Add label, Copy reference, Copy as LaTeX, Copy for Word, Save as new equation; only
    what applies to its kind) make the smallest edit: `$x$` becomes `\begin{equation}`, its text on
    a line of its own, `\end{equation}` in the place of `$x$` alone (the sentence keeps its bytes),
    and back exactly; `\(…\)`, `\[…\]`, `$$…$$`, `displaymath` and `equation*` written by hand are
    recognised and come off; a kind is changed by renaming `\begin{…}` and `\end{…}` alone (the
    field's own list of kinds does the same now; it rewrote the inner text), `\[ \]` for and from
    `equation`; unnumbered is `equation*` or `\[ \]` as the document writes them more, `\[ \]`
    where amsmath is not loaded; amsmath's kinds bring `\usepackage{amsmath}` in the same undo step
    where the document lacks it (mathtools, unicode-math, empheq and the ams classes count as having
    it). What cannot be done says why: rows or `&` where a kind has one line, a label, a tag or a
    comment for a formula in the line, a display in a heading, a caption, a cell, a footnote or in
    braces. Add label writes `\label{eq:N}` (the first number free) after `\begin{…}`; Copy reference
    gives `\eqref{eq:N}` (`(\ref{…})` without amsmath). A new equation still empty turns into a
    new one of the other kind, and goes when closed empty. *Alt+=* (Control+= on a Mac, where
    Option+= types ≠): numbered on an empty line, in the line in text, as Word's; it takes over from
    Ctrl+Shift+E, which made a numbered equation and is Track Changes now (B10); Help and
    llms-full.txt say so, and the browser and ribbon tests that pressed it use the Equation button.
    *The gallery* (Insert's Equation is Word's split button, its arrow "Equation options"; the
    tab's Equation gallery; the search box finds it by an equation's name): Word's nine built in
    equations drawn in display style, put in at the caret (a numbered equation on an empty line, in
    the line in text, opened in its field) or into the open field; *Save as new equation* keeps
    the field's equation, or the part selected in it, in this browser (`rikuy.equations.v1`, 40 at
    most, named, listed under "Saved in this browser", removable). *Packages:* what the tab puts in
    that needs amsmath (`\binom`, `\tfrac`, `cases`, `pmatrix`, `\iint`, `\xrightarrow`, `\boxed`)
    or amssymb (`\mathbb`, `\nleq`, `\varnothing`) adds the line when the field closes, once, in
    the field's undo step, only if the formula still holds it and the document lacks it (never
    amssymb after newtxmath, newpxmath, unicode-math and the other fonts that have its symbols and
    stop TeX with it). The field wrote `\middle{|}`, which TeX stops at: it writes `\middle|` now.
    Home's Equation stays one button (the row's room is measured for it). *Not done, as GAP has
    it:* Ink equation (I43, SKIP: handwriting recognition); Word's Equation Options dialog (math
    autocorrect settings: Rikuy's typing has no switches to set); Professional and Linear (E3,
    already better). *Security:* the audit skill's quick profile on the changed files (one pass by
    this batch's agent, no separate verifier; notes outside the repository) found one way a
    stranger's document reached the source: an equation saved from it was later written between
    `$` and `$` as it was, so `x$ \input{…} $`, a stray `}`, a `%` or `\end{equation}` closed the
    formula early in the person's other papers; saving, the store and putting one in now check that
    it stays a formula (`mathSafe`), with tests. Every scan of an equation's text is bounded.
    Evidence: `npm test` green with `equation.test.mjs` (11 groups: inline and display both ways
    byte for byte, kinds by names, `\[ \]` both ways, the document's unnumbered form, what each kind
    takes, labels, braces around a formula, packages and where they are there already, slots,
    saved equations bounded, `mathSafe`, the tables well formed) and a `word.test.mjs` case (the
    displays the tab writes go to Word as display equations, numbered where LaTeX numbers them, and
    come back unchanged; 56 groups); `eqtab.py` 106 (105 without `dist/tex`: what the tab and the
    gallery write, on a document with neither amsmath nor amssymb, compiles with pdfLaTeX, XeLaTeX
    and LuaLaTeX with the lines they brought); `agent.py` 141 (138; the Equation tab's controls by
    role and name at both widths, an equation made as llms-full.txt says); `tabs.py` 116 (its every
    command check opens a field for the Equation tab; the fold sweep passes with the tab's 22
    controls); `ribbon.py` 268; `browser.py` 189; `mathfield.py` 19; `eqextras.py` 18/18;
    `wordmath.py` 83; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43;
    `pages_check.py` fits; actionlint clean; the model and parser untouched. Screenshots of the tab,
    its menus and the right click menu at 1920, 1366 and 390 px, light and dark, looked at. Safari
    and Firefox, by hand: not done.
    *The review round* (a hostile reader of the first commit: 3 high, 3 medium, 6 low, all fixed,
    each case a test in `eqtab.py` `reviewed` and the unit files, compiled in the page where
    `dist/tex` is). Package order: `preamble.js` puts amsmath, amssymb, amsfonts and mathtools above
    cleveref, hyperref, esint, wasysym, txfonts, pxfonts, mathabx, MnSymbol, varioref, unicode-math
    and fontsetup where those are loaded, hyperref above cleveref, bookmark and hypcap; newtx,
    acmart and beamer count as having amssymb, mathabx and MnSymbol do not (`provides`,
    `packageOrder`; each rule found by compiling in the page). The packages a formula needs come in
    the undo step that put it in, and a change of kind with the field open is one step with its
    packages: no undo lands on a formula without its package. Change to unnumbered refuses a
    labelled equation (the field's list of kinds too), Change to inline one with a label anywhere
    inside. `mathSafe` also refuses `^^`, the defining, file and condition primitives (`\def`,
    `\let`, `\catcode`, `\input`, `\write`, `\csname`, `\every…`, `\if…` and the rest) and
    what KaTeX cannot draw, on saving, reading the store and putting one in. No display inside
    `tabbing` or `lrbox`; the Insert gallery's place is checked again after a share merge; CRLF
    documents keep their line ends; Add label on a new, empty equation says why not; a template's
    first slot takes the selection as `wrapSlot` does; a right click's equation is forgotten after
    Escape; Help and llms-full.txt say Ctrl+Shift+E is free until the review tools come.
    *Phones* (390 by 844 and 360 by 740, touch, taps, in `eqtab.py` `phone`): Insert's Equation is
    Alt+= by a tap (numbered on an empty line, in the line in text), its arrow the gallery, which
    fits the screen and scrolls; with the field open and its on-screen keyboard up, the tab's
    menus open above the keyboard (MathLive's, which the app measures, and the phone's own, which
    shrinks the visual viewport), their tiles, the tab's buttons and Insert's Equation 44 px each
    way under a coarse pointer; a long press on an equation opens its menu (without the right click
    line), a tap opens its field; the caret is back on the page when the field closes; nothing
    scrolls sideways (the hidden names of the ribbon's icon buttons past the screen's edge, placed
    from the page, made the whole page 384 px wider: the ribbon's row is positioned now, so no tab's
    do; `phone_tabs` checks every tab, the contextual ones open, at 390 and 360 px). Screenshots at
    390 px, light and dark, looked at. *Polish:* the structures' tiles drawn at 19 px (from 16: a
    small fraction's slots were hard to see), the gallery's formulas at 16; the tab declares Word's
    Conversions group between Tools and Symbols, for B12's Show LaTeX. Evidence after both: `npm
    test` green (`preamble.test.mjs` 20 groups,
    `equation.test.mjs` 11, `word.test.mjs` 57); `eqtab.py` 159 (37 of them on phones; the compiles
    need `dist/tex`); `browser.py` 190 (its kind switch on the sample's labelled equation now
    expects unnumbered refused and Aligned renamed); `mathfield.py` 19; `eqextras.py` 18/18;
    `wordmath.py` 83; `ribbon.py` 268; `tabs.py` 115; `agent.py` 141; `table.py` 161; `page.py` 139; `font.py` 272;
    `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43; `pages_check.py` fits;
    actionlint clean.

52. **The native core: the editor's heavy text work in C++.** Done in the code (branch
    `native-core`), asked for by the owner ("most things in C/C++", the fastest editor, phones).
    *Measured first* (Chromium's profiler, `dev/bench_native.mjs`, `dev/bench_native_page.py`;
    `dev/bench/long`, a 141 KB paper, and a generated document of 3000 paragraphs, 401 KB, 18,700
    nodes). A keystroke on the paper takes 32 ms: the model 16 to 17 (its parse 4.4), layout 8.7
    (5.8 of it the DOM's measuring), the caret 2.4, rendering 1.0, the undo record's scan of the
    file 1.8; on the generated one 71 ms (model 47, layout 10.5, caret 8.5). A first load: the paper
    133 ms; the generated document 3.4 s, 87 % of it layout in the DOM, the model 3 %. A share
    link's three way merge: 0.9 ms (the paper, 1 % of its lines changed on each side), 6.8 ms (the
    generated one), 57 ms at worst (1648 lines on each side). Review's marks: the diff is 1.5 of
    8.4 ms (the paper, 36 changes) and 16 of 198 ms (443 changes); the rest is painting. Find:
    5 to 8 ms, V8's own regular expressions over the model's text. Line cuts are the browser's:
    there is no JavaScript line breaker to port (`Layout.plan` is arithmetic, under 1 ms).
    `minimalRow` works on one formula row and asks KaTeX about every candidate.
    *Ported: `parse()`*, the one pure function on every keystroke that is long and crosses once
    (`tex/native/core/parse.cc`, `src/native.js`; ARCHITECTURE.md section 17). The C++ is parseJS
    function for function; parser.js keeps the tables and sends them at load; the tree comes back
    as numbers and becomes parseJS's objects key for key. `sh tex/build_tools.sh core` makes
    `tex/vendor/core/rikuy-core.wasm` (60,669 bytes after the review, 13.7 KB with Brotli; SHA-256 `83dc7c30...`;
    rebuilt byte for byte from another folder and a moved copy of the sources, and by `vendor.yml`,
    whose matrix now has `core`); the page fetches it as `core/rikuy-core-<hash>.wasm` once it is
    in use and idle and checks its hash, so a first visit on a slow phone line waits for none of it
    (the bundle grew 2 KB, not the 76 KB of the module in base64 tried first); the service worker
    keeps it (offline it loads from the kept copy), the hosted headers cache it for good, and the
    artifact's upload plan takes it. Where it cannot answer (no core, under 600 code units, nesting
    past 200, memory, a trap) parseJS does the work. *Gain* (node, one core, medians of 41):
    `parse()` 4.33 times faster on the paper (4.50 to 1.04 ms), 2.45 on the generated document
    (7.63 to 3.11), 2.44 on the sample, 2.05 on `lua`, 1.58 on the 766 character `heavy`; the
    corpus's 716 models 3.02 to 2.06 s in all. The model then builds about 3 % slower from the
    core's objects than from parseJS's (16.07 against 16.50 ms on the paper, parse excluded), so
    a keystroke gains less: in the page (1400 px, keystrokes alternating core and JavaScript)
    the paper's keystroke went from 29.7 to 29.3 ms and from 33.3 to 30.3 ms in two runs (the model
    alone 1.1 to 1.2 times faster), the generated one's from 70.8 to 65.5 ms; at a phone's speed
    (Chromium's CPU throttling, 390 px) the paper's from 131 to 112 and 140 to 121 ms at 4 times
    and from 170 to 149 and 191 to 173 ms at 6 times (18 to 21 ms, 1.11 to 1.17 times), the
    generated one's from 247 to 240 ms (4 times) and 368 to 365 and 450 to 400 ms (6 times). The core goes from bytes to running in 3 ms (compiling is off the main
    thread, which the throttling does not slow; a real phone takes longer, after the page is in use).
    *Not ported, with the reason:* the diff and the three way merge (off the keystroke path; in
    their situations they are 8 % or less of the time, so even an infinitely fast port gains under
    1.1 times there), Find (already native code in V8), `minimalRow` (inputs of one row and a call
    to KaTeX per candidate), line breaking (the browser's), the model's build (it makes the
    objects the renderer reads; see next), the undo record's scan (copying both strings into the
    core costs more than the scan; a chunked comparison in JavaScript is the fix).
    *Found while porting and fixed in both parsers, each with a test:* `\newenvironment{x}[` with
    no later `]` made the parse run for ever (a frozen tab, from a stranger's document);
    `\constructor{a}`, `\hasOwnProperty{x}` and `\begin{toString}` read Object.prototype from the
    tables and threw, and the page took no more typing; searches that leave the position where it
    was (`\(` without `\)`, an unknown command's `[`, a raw environment without its end) ran to the
    end for every occurrence: 7.0 s (JavaScript) and 5.9 s (the core) on crafted files of 120 to
    320 KB, now 30 to 70 ms, both remembering each search (the review's addition below bounds two more); and in `diff.js` a `push(...list)` of
    160,000 entries overflowed the stack, which stopped the Review tab on a long rewritten line.
    *Evidence:* `test/native.test.mjs` 28 checks in `npm test` (30 with the corpus): the same tree
    for all 11 documents of the repository and a generated one, 3000 random TeX-like texts, 2000
    random edits of real documents and 998 of 998 corpus files, every one of the 716 corpus models
    the same with and without the core, 400 texts through the core and back unchanged, the stalled
    searches under 1.5 s, the fallbacks; four bugs planted in the C++ (a backtracking order,
    `fil` before `fill`, a carriage return, a surrogate's bit) each fail it (661, 924, 373 and 157
    checks). `npm test` green; corpus model run 716 of 716; `browser.py` 192 (3 new),
    `agent.py` 138, `tabs.py` 116, `ribbon.py` 268, `find.py` 76, `outline.py` 59, `share.py` 46,
    `history.py` 39/39, `offline.py` 55/55 (1 new), `launch.py` 18/18, `deploy_check.py` 44/44 (1
    new), `pages_check.py` fits; the artifact build (`RIKUY_SHARE`, `RIKUY_NO_WORD`) has the core
    beside its page. The security audit's quick profile ran on the changed files (one reviewer).
    *Next, to move the heavy work into C++ with JavaScript as the reference:* (1) the model's build
    is 50 to 70 % of a keystroke on long documents and phones: first build only the blocks whose
    source changed (the renderer already keeps unchanged blocks by key), then move its per
    character work (the source maps of `Acc.ch`, `text`, `inl`, `countWords` with Unicode tables)
    into the core with the maps as typed arrays, held equal by the corpus's serialised models as
    now; (2) parse only the changed region, splicing the tree, so a keystroke parses a paragraph;
    (3) the diff and merge, once Review's painting is incremental (it is 92 % of that situation);
    (4) Knuth and Plass line breaking from measured widths, which would spare layout the DOM's
    line measuring and give the page TeX's lines (needs Paper Modern's glyph widths and KaTeX's
    boxes: a task of its own). Find stays on V8's regular expressions.
    *Review* (a fresh hostile reader; no High, 2 Medium, 5 Low, all fixed with their inputs as
    tests): a `$` that never closes still scanned to the end from every `$` (`'$\verb|{|'` 22,000
    times: 6.7 s in JavaScript, 5.9 s in the core); the units read by failed `$` scans are counted,
    and once they pass 2,000,000 in a parse a `$` closes within 1000 units or not at all (a fixed
    bound of 5000 for every scan, tried first, broke an 8879 unit `$$` polynomial that TeX
    compiles, as the verifier found): 124 and 40 ms, and the 990 KB version 674 and 191 ms; every
    file of the corpus parses as on main. 8000 raw environments of 8000 names, none ended, made the memo
    per name scan 8000 times, and the core, whose searches are plain loops, was twice as slow as
    JavaScript (4.6 against 2.3 s): every `\end` is now indexed in one pass, 19 and 8 ms. A second
    `loadCore` kept the last document's signatures as sent, and gave wrong trees; a trap left the
    instance in use (now the core is off for the session); without SubtleCrypto the module was
    loaded unchecked (now not at all); every entry of every table the core reads is now a case of
    the test (a merge that edits one side fails); the nesting limit is 200 for arguments too (it
    was 100). Prototype names: `\toString`, `\valueOf` and `\toLocaleString` were, on main,
    commands of no arguments whose star was not taken (`'toString' in CHARS`); now they are unknown
    commands, which take their adjacent groups and their star. `test/native.test.mjs` 39 checks
    (41 with the corpus); after the verifier's two Lows (the budget above, and every environment name
    the repository, its tests and the corpus write, and every word parser.js quotes, read the same
    by both, so a name list kept inline on one side fails) 43.

46. **B8, pictures and objects as in Word.** Done in the code (branch `wordgap-b8-picture`), rows
    P1 to P3, P6 to P8, L12, L13, L15, I12, I13, I15 to I17, I30, I36 and C3 of the gap list (task
    38); P4, P5, L14 and I14 stay skipped as the list says. *Selecting.* A press or a tap on a
    picture selects it as in Word (`picSelect`, `src/cmd/picture.js`): a frame with eight handles
    over it (`src/ui/handles.js`, outside the text the editor owns), the contextual tab Picture
    Format opened (a phone's "Ribbon tab" list too), no bubble of bold and italic; a double click,
    Enter or Show Picture Source edits its `\includegraphics`; Delete takes it out; a caret put
    elsewhere lets it go. *One reading of a picture.* `src/picture.js` finds the
    `\includegraphics` in the parser's tree of its file (kept while the text is the same): its
    options as key=value pieces (graphics' bounding box form told apart), the boxes round it
    innermost first (`\reflectbox`, `\scalebox{1}[-1]` and `{-1}[1]`, `\rotatebox`, `\fbox` and
    Rikuy's `{\setlength{\fboxsep}{0pt}\fbox{…}}`, `\resizebox`) and the block it stands in (a
    center or flush environment, a figure, a wrapfigure, a paragraph of its own, a sentence, a
    box) with what else is there (its caption, label, `\centering`) and round it (floats, boxes,
    multicols, lists, a beamer frame). *The commands*, each one commit with its packages through
    `packageEdits` and the picture selected again after: Height and Width fields (a length, or a
    share of the line: "50%" writes `0.5\linewidth`; a hand written `\textwidth` share stays one;
    arrows step), the handles (corner or side, the shape kept; Shift frees it, and with Lock Aspect
    Ratio off the other way round, which is how a phone frees it; a snap to twentieths of the line
    within 1.2 %, else a length to the millimetre; a tip says what will be written; Escape gives
    up), Lock Aspect Ratio (the height written or taken off), Crop (the whole file dim, the part
    kept bright, black bars, Enter writes `trim=… ,clip` in cm, Escape gives up; Crop by
    Numbers…, Remove Crop; viewport read as a crop), Rotate Right and Left 90° (`angle`, back to
    none; a hand written `\rotatebox` turned in its argument), Flip Vertical and Horizontal,
    Picture Border, Alt Text (`alt={…}` escaped as TeX reads a key, or Mark as decorative,
    graphicx's `artifact`; graphics' bounding box form gets a `% alt:` line), Reset Picture and
    Reset Picture & Size, Change Picture (a safe name, the options kept), Insert Caption (`\caption`
    in a float, `\captionof{figure}` with caption's package in line, a center made round a picture
    alone; References' own Insert Caption takes over where a batch brings one), Position (In Line
    with Text, Best Place, Top, Bottom, Here If It Fits, Exactly Here with the float package, Page
    of Floats, Left or Right with Text Wrapping), Wrap Text (In Line, Square, Tight and Through as
    one wrapfigure, Top and Bottom as a figure; Behind and In Front of Text disabled: LaTeX has no
    form), Size and Position… (all of them in one step). In line with text is a center; a figure
    from it has `\centering`, back byte for byte, its `\captionof` becoming `\caption` and back; a
    wrapfigure takes the picture's share of the line and the picture `width=\linewidth`, which
    goes back with it (a length stays the picture's); sizing a picture that fills its wrapfigure
    sizes the wrapfigure. Not moved, the reason said: a picture in a sentence, in a box, in
    multicols, in a list or before one (wrapping), in beamer, a figure holding more than it,
    `[H]` under memoir. The same Position, Wrap Text and Rotate on Layout's Arrange; the picture's
    right click menu (C3: Change Picture, Size and Position, Crop, Wrap Text, Insert Caption, Alt
    Text, Show Picture Source, then the selection's items), which a long press opens on a phone.
    *Insert's objects*, each a block of its own in a center after the caret's block (never a
    float, so never in columns or another float), its package once: Shapes (twelve, a TikZ
    picture of one path, filled blue like Word's), Icons (a gallery of 32 fontawesome5 names,
    `\faIcon{…}` at the caret), SmartArt (five kinds of smartdiagram from items one per line),
    Chart (column, bar or line from a grid holding Word's sample data, a pgfplots axis with its
    coordinates in the source and `\pgfplotsset{compat=1.18}` with the package; inline data, not
    a .csv: the chart travels with its paragraph, one undo, and Table from Data File already makes
    .csv tables), Screenshot (the browser's capture, one frame as screenshot.png placed as a
    picture), Text Box (`\fbox` round a minipage, a shaded tcolorbox, or one beside the text in a
    wrapfigure; "Type here." selected to type over), Drop Cap (Dropped, In Margin, None, Options:
    `\lettrine[lines=3]{T}{his}`, `lhang=1`, `findent`; None gives the word back byte for byte).
    *The page* draws a picture as graphicx sets it: `graphicBox` applies trim, width, height,
    scale, keepaspectratio and angle in graphicx's order to the file's natural size, which
    `naturalSize` reads from its first bytes as pdfTeX does (a PNG's pHYs and a JPEG's JFIF dots
    per inch, rounded; a PDF's box), so a crop cuts where TeX cuts and a turn takes TeX's box; a
    picture with no width is drawn at TeX's size; flips and frames are drawn on the picture
    (composed: a flip of a flip is none); a picture's width is now a share of its line, not of its
    own shrunk box (a small picture at `0.5\linewidth` was drawn at half its own size); its alt
    text is the image's alt; a center holding `\captionof{figure}` is drawn as TeX prints it, the
    picture with "Figure 1: …" under it, where it stands; a wrapfigure's parts are as wide as it is (it is drawn as a float
    until B6 wraps text round it, as the gap list says). `src/drawing.js` draws what Insert
    writes, and hand written pictures in the same subset: a TikZ picture of plain paths (lines,
    arrows, rectangles, circles, ellipses, polygons; xcolor names and mixes, widths, dashes,
    rounded corners; anything else keeps the source box), a pgfplots axis of bars or lines from
    coordinates, smartdiagram's boxes and arrows, each icon, a tcolorbox framed at its width and
    colour, an `\fbox` minipage at its width, a lettrine letter over its lines. *C and C++:* the
    browser decodes the pixels and the page draws them; what it lacked was the resolution TeX
    reads, forty lines of bounded header parsing, so no C library was brought in (the brief's
    rule: none where the browser's canvas is enough). *Word:* a picture's alt text goes out as
    its description (`descr`) and comes back as `alt={…}` (pandoc 3.10 writes it); a height with
    the width goes too. *Phones:* at 390 and 360 px with touch the tap selects, a finger on a
    handle sizes the picture with the page held still (no pan, no pinch zoom while a handle or a
    bar is held), the handles and bars are 44 px targets under `pointer: coarse`, as are the
    tab's buttons and fields and the dialogs' fields; the dialogs are sheets at the screen's foot;
    fixed on the way: a button's screen reader name (`.sr`) placed where the button is widened a
    phone's page when the button was past the screen's edge in the scrolling row (the Picture
    Format tab took a 360 px page to 847 px). *Agents:* every command by id, the dialogs' fields
    as arguments (llms-full.txt), validated (a length or a share, crops finite, drop cap lines 2
    to 10); `test/agent.py` opens Picture Format by a press on a picture. *Security:* the audit
    skill's quick profile on the changed files (notes outside the repository): the one innerHTML
    takes the code's own icon table; a document's words reach the page as text and its colours
    only from xcolor's table; every style written is a number; every reading capped (text,
    commands, points, chunks, depth), each with a bounded-time test; no finding.
    Evidence: `npm test` green (`picture.test.mjs` 15 groups and `drawing.test.mjs` 6, new;
    `word` 58, one new: alt text both ways); `tabs.py` 116, `agent.py` 140 (Picture Format
    reached by a press on a picture), `browser.py` 189, `ribbon.py` 268, `page.py` 139, `word.py`
    111, `offline.py` 54/54, `launch.py` 18/18, the corpus model run 716 of 716, `pages_check.py`
    fits, actionlint clean; `test/picture.py` 147 (new): the round trip rule on 22 commands with their hand written forms,
    sizing by mouse and by finger, the fields, Crop, the dialogs, the menus, where a picture
    cannot go, the page's drawing measured, Insert's objects, phones at two widths, and in the
    page with `dist/tex` every construct compiled by pdfLaTeX with no error and the picture's box
    in the PDF equal to the page's within 2.5 pt for a quarter turn and for a crop. Not done:
    I12's handles that write a shape's coordinates (a shape is edited in its source box, its
    drawing redrawn); Chart's grid opened again on a chart (its coordinates are edited in the
    source); P7's border colour and weight; icons are the code's own drawings of fontawesome5's
    symbols, not its glyphs; rotation by a free angle with the mouse (the dialog's Rotation
    field takes any angle); the wrap's text flow on the page (B6).
    *Review* (a fresh hostile reviewer of bd641ad: 10 high, 6 medium, 6 low, each reproduced; each
    fixed with its case as a test, compiled in the page where TeX is the judge): nothing stays
    selected across an undo, a redo, a merge or a picture gone from the page, and Backspace
    deletes only what is still selected, at the offsets it has now (it had deleted half a picture
    and its `\end{center}`); a size key added to a turned picture goes before `angle` (a height
    after `angle=-90` stopped TeX with "Division by 0"), and the page walks graphicx's keys in
    their order (sizes before the angle size the picture, after it the turned box); an angle given
    by a macro is not overwritten; Icons refuse where Font Awesome 4 is loaded and add no package
    where 6 or 7 gives `\faIcon`; a picture in a subfigure, a minipage or a `\parbox` is a share
    of that box, not of the line (they had grown two to three times and moved figures a page on);
    the sizes read from the files come in one rebuild, not one per picture (120 pictures froze the
    page 24 s), and the first Crop waits for the file's size instead of closing; the natural size
    reads Exif's resolution (cameras' JPEGs), JFIF's dots per centimetre truncated as pdfTeX does,
    and a PDF's `/Rotate`, each against the three engines' sizes; `\caption*`, `\captionof*` and
    `figure*` keep their stars (figure* has no in-line or wrapped form and says so), a starred
    caption has no number and shifts none, beamer's caption is "Figure:"; only Rikuy's own charts
    are drawn as charts, a hand written axis keeps its source box; SmartArt stops at ten items
    (eleven for Bubbles), as smartdiagram does; wrap is refused in a quote, a theorem, a proof or
    any environment round the picture and before a heading; Exactly Here under memoir loads float;
    decorative is a `% alt (decorative)` line (graphicx's `artifact` is TeX Live 2024's); a turned
    picture's handles size its own sides; a picture with its caption in a list item keeps the
    item's indent; a small picture in a line has one handle and no wide target over the words.
    Evidence: `picture.test.mjs` 20 groups, `drawing.test.mjs` 7, `test/picture.py` 168 (22 new,
    four compiles in the page: the height before the angle, an Exif JPEG at TeX's size, a starred
    caption numbered as TeX numbers it, SmartArt of ten items).
    *Verification* (a fresh verifier of the review round: 21 of 22 fixed; the Exif fix brought a
    new high, and seven more, each fixed with its case as a test): a JPEG with a JFIF header of no
    unit (PIL's and libjpeg's default) keeps 72 dpi whatever its Exif says, as the three engines do
    (it was drawn 4.2 times too small); Exif's resolution truncated to whole dots per inch and its
    unit "none" taken as inches, as pdfTeX reads them; beamer steps the figure counter, so `\ref`
    gives the number its caption leaves out; a picture in a `\scalebox` takes the scaled box on the
    page (CSS scale had left its line the unscaled height); a `\scalebox` of an `\fbox` of words is
    the Font group's; the Font Awesome 4 refusal names v4's own command; a picture's first
    selection rebuilds nothing; wrap is allowed in a language's, line spacing's or landscape's
    environment; free size on a hand written angle then width writes both before the angle, and
    Lock Aspect Ratio shows on where a size key follows the angle. Evidence: `picture.test.mjs`
    21 groups (`test/fixtures/jfif0-exif300.jpg` new), `test/picture.py` 174 (6 new, one compiled:
    that JPEG at TeX's size in the PDF and on the page).
50. **B12, File, View and Help, with the owner's views.** Done in the code (branch
    `wordgap-b12-file`). The owner asked for the math and everything to look and feel like Word,
    to switch to LaTeX right there and back and forth with the PDF, and to be shown how the
    interactive graphs work. *Views:* the status bar's Page · LaTeX · PDF (group "Views"; Word's
    view buttons beside the zoom slider and percent) shows the page, the source or TeX's PDF
    across the window, one at a time, at the same place: the caret's source position into
    CodeMirror and back, SyncTeX into the PDF and back (the line at the top third of the PDF's
    window, or the one clicked there); a current PDF shows without a compile, a stale one shows
    while TeX makes the new one ("Updating the PDF"); the page stays laid out underneath, so
    going back costs no layout; Preview and Source keep showing the PDF or the source beside the
    page, and pressed in another view go back to the page first; the panes a reload opens with
    stay as they were. The arrows move between the three; on a phone they are first in the status
    bar, 44 px each. View's Read Mode, Print Layout and LaTeX Mode are the same three. *Show
    LaTeX* (Shift+F9, the right click menu, View › Show; Ctrl+Shift+= in the equation field, as
    Word's Linear; the Equation tab's Conversions group once B13 declares it) turns the caret's
    paragraph or equation, or each block a selection touches, into its source where it stands:
    a view, never an edit (no mark written). The model takes the blocks' starts
    (`project.views`, kept in place across every change of the text) and draws them as the LaTeX
    paragraph's box, so typing, Enter, undo and layout are that box's own; Esc shows it typeset;
    Word's export and Export as read the model without it. *Interactive graphs, taught:* Help ›
    Interactive graphs (how `\rikuywidget` is written, the widget's rules and height message, the
    picture TeX prints, which download keeps what; B11's Insert › Interactive graph is offered
    where registered) and Help › Learn Rikuy, a document of its own (`src/tour.js`, 5 KB) with
    typing, the three views, an equation with Show LaTeX, and a live graph with two sliders whose
    picture for TeX is a vector PDF made in the page from the same curve. *GAP rows:* F2 New from
    template (article, report, book or thesis, letter, KOMA-Script, beamer, exam, CV; each
    compiles in the page), F4 Recent documents (open, remove; no rename), F5 Properties (title,
    author in place; subject and keywords through `\hypersetup` or hyperref's options, hyperref
    with hidelinks where none is loaded, a `\hypersetup` line under beamer), F8 Check
    accessibility (alt text, skipped levels, header rows, title, language; Tag the PDF writes
    `\DocumentMetadata{lang=..,pdfstandard=ua-2,tagging=on}`), F12 Export as (HTML with MathML,
    Markdown, ODT, RTF, EPUB, plain text, by the Word worker's pandoc), F22 Set as default (the
    preamble kept in the browser for Blank document), H41 Show marks (Ctrl+Shift+8; partial:
    paragraph ends, line breaks, hand set spaces; no `~` or `\label` marks), Q2 Undo's list
    (the arrow "Undo options"; in the phone's menu panel too), Q3 Repeat (F4, Ctrl+Y with nothing
    to redo), Q5 was B0's (Ctrl+F1), V1 Read Mode (the PDF view), V3 Draft (partial: the pages run
    on with a dotted line where TeX turns the page; no reflow to the window as Web Layout),
    V5 Focus (Esc or Leave Focus), V7 Side to Side, V11 One page and Multiple pages (the slider in
    the place of a Zoom dialog), V12 Dark page (the screen only), HL1 (Learn Rikuy, Interactive
    graphs, Keyboard shortcuts from the registry, What's new), S4 (views, slider, percent).
    Not done: Q6 KeyTips (Alt is the browser's; F10 in the installed app is a task of its own),
    V8 the ruler (B6's layout has no ruler to hang margins and indents on; M effort). File stays
    a row of groups, not Word's backstage panel, so the fold rule, agents' names and the phone's
    scrolling row hold. Security quick review: Check accessibility's two patterns backtracked on
    a stranger's run of spaces (a minute for 200 000); now a bounded scan, with a test.
    *After the hostile review of 8c6c832* (4 High, 4 Medium, 12 Low; each with the reviewer's case
    as a test, `test/file.test.mjs` new, `view.test.mjs` and the `review` part of `view.py`):
    Properties (now `src/props.js`, on strings) writes only the fields changed, compared as the
    source holds them, and only the stretch typed, escaped (`& % #` always, `_ ^` outside math, a
    lone `$`, a backslash counted as a run), so an author's comments, line breaks and a tabular's
    `&` stay (H1, L4); title and author are text areas. hyperref comes bare,
    `\usepackage{hyperref}`, before cleveref, hypcap, bookmark, glossaries and the others that must
    follow it, its keys in `\hypersetup` (H2); a class that loads hyperref (acmart, beamer,
    moderncv, tufte, aastex, ...) gets a `\hypersetup` line only (H3); a key is changed and cleared
    where it is read, options or `\hypersetup`, comments read as TeX reads them (L5); with
    `dist/tex` the review's author, cleveref and acmart documents compile in the page. Tag the PDF was
    held back: the tree left out tagpdf's HTML files, so a tagged compile stopped (H4; task 60
    offers it again). Export as drops Word's anchors and pictures it has no bytes for (M1, L7); a name in
    another script exports as `paper.*` (L8). The blocks shown as LaTeX move with the edits of
    commit, undo and redo in one pass (a key inside undo's merged region through its hunks; other
    changes as line hunks): 40 views in 850 KB under 30 ms a keystroke, a commit in the preamble and
    the body or a Replace All keeps them (M2, M4); a key is the block's first character, so Enter at
    its start keeps it (L1). Repeat follows a command only, typing ends it, and nothing that deletes,
    clears, sorts, merges or splits is repeated (M3). Paste into a view of a CRLF file writes CRLF
    (L3); Replace's LaTeX paragraph rule and the Styles gallery ignore views (L10); Esc acts only
    with the caret on the page, never mid composition (L11); Interactive graphs opens below the
    ribbon at its top (L2); Remove takes the document's pictures too (L6); Set as default refuses a
    preamble that reads project files (L9); the status links are 44 px under a finger (L12).
    *After the verifier's round on 3f8a4f7* (one High, eight smaller; each with its case as a test):
    a field compared character by character, one edit for each changed run, so two changes in one
    title or author never touch the source between them; in the dialog the typing itself says which
    characters were typed (an `&` typed beside the source's own one), the text alone only where an
    agent sets a field (V1). Typed text is escaped in its place: after a backslash, inside `\(..\)`
    or `\[..\]` (V5). acmart takes its subject only at the document's end (a compile and pypdf
    show it): `\AtEndDocument{\hypersetup{..}}` there, and its keywords, which its PDF never
    carries, are refused with a word about its `\keywords` (V2). hyperref in a hook or braces
    (`\AtEndPreamble`) gets its keys at `\AtBeginDocument` (V6); hyperref new to the main file comes
    with hidelinks only where nothing loaded it before, through `\IfPackageLoadedTF`, so a class's
    link colours stay (V7). The keys of the shown blocks move into a new set (two never collapse,
    V3), an edit's hunks read once for all the keys inside it (one undo over 40 views in 850 KB well
    under 50 ms, V4). Set as default takes `\input@path` (V8); Help's guides stop above the status
    bar (V9).
    Evidence on main 5fcb643 (B4's styles and B8's pictures in): `npm test` green (`view` 18,
    `file` 15 groups), `view.py` 108, `file.py` 77, `styles.py` 333, `picture.py` 174, `tabs.py` 115,
    `ribbon.py` 195, `agent.py` 141 to 143 with the new tabs' controls, `browser.py` 193,
    `offline.py` 58/58.
    Evidence on main 07069e1 (B3's lists, B13's Equation tab, the native parser and B2's Paragraph
    group in; B2's Show marks, Ctrl+Shift+8, replaces B12's, with View's copy "Formatting marks"):
    `npm test` green (`view` 16 checks, `file` 11 groups, both new), `view.py` 108 and `file.py` 73
    (with `dist/tex` and `dist/word`), `eqtab.py` 159 (its Equation tab now has Conversions with
    Show LaTeX), `para.py` 204, `tabs.py` 115, `ribbon.py` 270, `agent.py` 141, `browser.py` 193,
    `offline.py` 55/55; on 3ad0d31 `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py`
    fits, the corpus model run 716 of 716.

53. **The incremental model build.** Done in the code (branch `perf-incremental-model`), the next
    native step task 52 proposed. A keystroke in a paragraph of plain text rebuilds that paragraph
    only (`incremental` in `src/model.js`, ARCHITECTURE section 1); every other case is the full
    build, which is the oracle. Measured in the page (`dev/bench_native_page.py --toggle incr`,
    keystrokes alternating on and off, medians of 20, on main 07069e1): `dev/bench/long` 34.7 to 23.1
    ms a keystroke (the model 15.0 to 5.2), the generated 401 KB document 73.4 to 41.3 ms (model
    49.7 to 16.2); at a phone's speed, 390 px: 4 times throttled 122.9 to 96.0 and 272.3 to 176.5
    ms, 6 times 166.6 to 107.8 and 466.6 to 231.6 ms (1.3 to 2.0 times a keystroke, the model 2.6
    to 3.6 times). In node the model of a keystroke on the paper is 16 to 2.8 ms
    (with the native core). It covers 52 % of the paper's paragraphs and 69 % of the generated
    document's: a paragraph with a citation, a reference or a footnote takes the full build.
    *Chosen:* units after the edit are moved, not made relative to their block: the renderer
    already keeps offsets relative to a block's base, but the model's consumers (Word's export,
    the editor's maps) read absolute ones, so moving is the small change; and moved lazily (the
    renderer reads only a kept block's range) with one cumulative shift per unit, it costs
    nothing per keystroke where a deep copy cost 7 ms on the generated document. *Not done:* the
    model's per character maps in C++: with one paragraph built per keystroke the model is 3 to
    5 ms of a 22 to 36 ms keystroke at a desktop's speed, the rest being the DOM's layout and the
    caret, so a port would not pay; a first load is 87 % layout. *Evidence:*
    `test/incremental.test.mjs` (in `npm test`): every edit of random streams of the repository's
    documents equal to the full build from the same last model (4000 edits, 282 on the fast path),
    90 unread keystrokes in two paragraphs, a field that moves with the text and is not in
    `OFFSET_KEYS` (it caught B2's `ps`, `pe`, `vs`, `ve` at the rebase), another document or main
    file never taking the fast path, typing in each construct of B4 Styles (a paragraph a heading
    runs into, by `\paragraph`, `\subparagraph` and titlesec's runin, on the fast path; a paragraph
    style's and a theorem's paragraphs by the full build) and of B2 Paragraph (line spacing and
    `\centering` declared before a paragraph, carried over; a hanging indent and `\nopagebreak`
    by the full build) and of B8 Pictures (the paragraphs a wrapfigure wraps and one after a
    tcolorbox on the fast path; a paragraph with a picture, a `\scalebox`, a `\captionof`'s caption
    and a boxed paragraph by the full build), 25 checks, the streams over 8 documents (5200 edits,
    356 fast); with the corpus 11,664 edits over 724 documents (738 on the
    fast path, the corpus being short documents full of commands), all equal. Rebased on B2 (its
    `ps`, `pe`, `vs`, `ve` named in `OFFSET_KEYS`, its line spacing carried) and B4 (run in
    headings carried; B4 added no offset field and no inline command, so `PURE_CMDS` stays) and
    B8 (no offset field; its boxes read the builder's box share, so `\scalebox`, `\rotatebox` and
    pictures stay out of `PURE_CMDS`). `npm test` green, the corpus
    model run 716 of 716, `browser.py` 193, `styles.py` 333, `word.py` 111 (on d55b5fa); `find.py` 76,
    `history.py` 39/39, `share.py` 46, `agent.py` 141 (on 07069e1); the security audit's quick profile (one reviewer, notes outside
    git): nothing is kept across documents, every reuse is proven against the new text. The
    hostile review (1 High, 2 Medium, 3 Low) found, and this fixes, each with its case as a test:
    moved units lost what they shared (a footnote's mark no longer its atom, so Word's export
    dropped the note after a fast keystroke; one memo per unit now, and the oracle compares each
    unit's shared parts); a table of contents drawn from a first pass with `??` kept its stale
    signature (the full build when its entries differ); a LaTeX paragraph's `nest` pairs were not
    moved (and the offset guard now inserts before every unit, not once after
    `\begin{document}`); a warning of the old paragraph stayed; fields the app wrote on the last
    model were carried. Added: a development build's self check (every eighth fast build against
    the full one, the full one kept on a difference; none in production). After the fixes: the
    streams over 9 documents 5600 edits (361 fast), 32 checks; the reviewer's fuzz, seeds 25, 26,
    27 and 43 with shared references compared, no difference; with the corpus 11,680 edits over
    725 documents (707 fast), all equal; `npm test` green, the corpus model run 716 of 716,
    `browser.py` 193, `word.py` 111, `picture.py` 174. *Next:* the same for paragraphs with citations,
    references and footnotes (their entry state recorded per unit: the counters, the citations
    and labels so far), which would take most of the paper's other paragraphs.
49. **B11, Insert, the clipboard and AutoCorrect, interactive graphs first.** Done in the code
    (branch `wordgap-b11-insert`), the owner's priority first: "show how to use interactive
    graphs, since that's new here". Insert › Interactive graph (`src/graph.js`,
    `src/ui/graphdialog.js`; command `insert-interactive-graph` in Insert › Illustrations, which
    Help can call, and in the insert list): four kinds in a gallery, the
    formulas typed as in Word, Desmos or LaTeX (`2x`, `a sin(b x)`, `\frac{1}{2}x^2`, `|x|`,
    `if(x<0,0,x)`), data pasted from a spreadsheet with a least squares fit and R², a polar or
    parametric curve, nine distributions or the mean of n draws; sliders named and ranged in the
    dialog (a letter in a formula gets one by itself), a live preview, and one undo for the file,
    the picture, the command, `rikuy.sty` and the package. Edit graph (a button over the graph,
    the frame's own right click or long press menu, the command) edits it; nothing changed,
    nothing written. Evidence: `test/insert.test.mjs` (13 groups: the formula language and its
    mistakes, caps on a stranger's graph, the file read back and written to the same bytes,
    fits, every density integrating to 1, the CLT template equal to `sample/widget`'s histogram
    bin for bin, graphKit running from its own text); `test/insert.py` (115 checks with
    `dist/tex`: insert, undo and redo with the picture, edit, a hand written command's `.jpg`
    fallback pointed at the PNG, the four kinds' pictures against their live figures in pixels
    (mean difference under 4 of 255), the hint once, the frame's menu at most once a second,
    the sandbox and a description that tries to leave its script element, phones at 390 and 360
    px with touch (the dialog fits, 44 px targets, Edit graph 44 px on the screen, a slider moved
    by a tap), and a graph compiled on pdfLaTeX, XeLaTeX and LuaLaTeX with its picture). The
    drawing is plain JS: 600 samples of a formula take 0.1 ms and the mean of 50 draws 4000
    times 8 ms (node), so no native code.
    Rows: H2 (Paste; Keep Text Only, as LaTeX source and Paste Special as commands the search box
    finds) done; H3 changed: Cut, Copy and Paste in the right click menu and the search box, not
    on Home's row (there Paste alone took the Styles gallery's tiles from 1920 px and folded
    Editing below 1100 px: `test/ribbon.py` and `test/tabs.py` keep that room for the gallery);
    I44 (Symbol, its grid with the ones used last, More Symbols with a search) and I45
    (Special Characters and their keys: Ctrl+Alt+C, R, T, ., Ctrl+Alt+-, Ctrl+Shift+Space,
    Ctrl+Shift+_, which Ctrl+- zoom no longer takes) done; I38 (Date & Time: `\today` or fixed
    text, Alt+Shift+D and T; a command the search box finds, not a button: Insert's row had no
    room for it at 870 px) done; I39 (Text from file: the file and `\input`, one undo) and I40
    (PDF pages: `\includepdf[pages=-]` with pdfpages and the file, one undo) done, both under the
    command Object (no room on Insert's row at 870 px; the search box reaches them); I47 (Environment, in the search box and
    the insert list; not on the row, for the same room) done, the live figure being Interactive graph, the LaTeX paragraph Home's
    style; A5,
    A6 (off by default), A7, A9 (sentences, two capitals, days; not table cells or Caps Lock) and
    A10 (Word's list and one's own) done in `src/autocorrect.js` (`test/autocorrect.test.mjs`),
    each correction one undo after the typing; F19 and F20 as File › AutoCorrect Options (the
    user name and initials, every switch, B1's *bold* among them). I2 Blank page was done by B6.
    Not done, left open: H82 (drag to move), I1 (cover pages), I31 (Quick Parts), I32 and I33
    (document properties and fields, which need the page to draw them), DV1 (form fields). The
    The hostile review of a228b19 (7 High, 4 Medium, 10 Low, each reproduced) is closed, each
    case a test (`test/insert.py` review and review_compiles, compiled in the page;
    `test/insert.test.mjs`, `test/autocorrect.test.mjs`): an address AutoCorrect makes a `\\url`
    brings `\\usepackage{url}` in the same step where no url, xurl or hyperref is loaded (H1); a
    graph's frame opens Rikuy's menu only after a press in it, once a press, with nothing else open
    (H2: a frame asking every 60 ms takes no letter and closes no dialog); the PDF's picture is
    drawn at its own box's width (a column, a width option, the margins changed) before every
    compile and as the page shows it, with a pHYs chunk so TeX takes its natural size (H3, H4);
    binomial means by their cdf, 790 ms to 24 ms, and a slider computes once a frame (H5); Text
    from file takes a whole document's body and its packages (H6); rikuy.sty is looked for beside
    the main file alone (H7); a missing picture is drawn again (M1); each graph's name has four
    random letters, so two coauthors' graphs never meet in a merge (M2); Update with nothing
    touched keeps a graph's own shape and exact numbers (M3); Word's INitial CAps exceptions
    (MPhil, DPhil, OAuth, DNase...) and a correction undone becomes one, f(c) and (a) (b) (c) stay
    (M4); on a phone Edit graph sits at the top's centre (L1); Paste Special replaces the
    selection (L2); a Mac's Date and Time are Control+Shift+D and T (L3); one's own replacement is
    escaped as typing escapes it (L4); the unused initials field went (L5); a captioned graph gets
    `\\label{fig:<name>}` (L6); a graph's file is 33 KB built (graphKit minified; L7); no Abstract
    where the class has none, and align*, tikzpicture and the like bring their package (L8); an
    input method's Enter (keyCode 229) inserts nothing (L9); inherited names are no names in the
    formula language (L10). The graph's description is its picture's alt text, and Word gets the
    PDF's picture with its caption and alt text, the graph unchanged on the way back
    (`test/word.test.mjs`): graphs move on Rikuy's page alone.
    security audit skill's agents could not run in this session; the changed files were reviewed
    by hand against its client side and resource classes, with no finding.

48. **B10, review and proofing as in Word.** Done in the code (branch `wordgap-b10-review`), rows
    RV1, RV4, RV5, RV7 to RV9, RV13 to RV15, RV17 to RV20, F7, F14, S2 and S3 of the gap list
    (task 38); RV2, RV3 and RV21 not done (below). *Spelling in C++.* Hunspell 1.7.6 (Ubuntu's
    source package, pinned by hash in `tex/build_tools.sh`, where every vendored program's source
    is pinned and where `vendor.yml` rebuilds it; `fetch_inputs.sh` is the TeX tree's) with
    Rikuy's C functions (`tex/native/spell/spell.cc`: open, check a list in one call, suggest,
    add) built by `sh tex/build_tools.sh hunspell` into `tex/vendor/hunspell/` (wasm 462 kB, 150
    kB gzipped; glue and worker 87 kB), with the dictionaries en_US (SCOWL), en_GB and es_ES
    (LibreOffice's), de_DE (igerman98) copied unchanged from Ubuntu 26.10's packages, each `.deb`
    pinned by SHA-256 and checked against that release's index (4.5 MB, 1.4 MB gzipped). Two
    builds from empty `RIKUY_SRC` folders gave the same bytes; `vendor.yml` has the `hunspell`
    job. It runs in a worker (`src/spell/worker.js`, `client.js`) started with the first check;
    the module and each dictionary are fetched only when a word of that language comes and used
    only with the SHA-256 the bundle names (`spell/<name>-<hash>`, cached for good; the service
    worker keeps the module at install and a dictionary at its first use). The artifact's copy
    has no room (2 MB were left under its 256 MB) and keeps the browser's own spelling, as any
    build with `RIKUY_NO_SPELL`. *Only prose.* `src/spell/words.js` reads the words from the
    model's seg runs, never the source: no command, key, label, citation key, reference, math or
    macro output is a word; `\texttt`, `\url`, verbatim, Asymptote, PSTricks, TikZ and
    listings environments, addresses, file names, key=value lists, capitals and words touching a
    digit are not checked (Word's rules). On the corpus (`node test/spell.test.mjs <clone>`): 716
    documents, 56,799 words checked, none inside a command's name, a key, math, verbatim, a URL,
    a file name or a comment. The dictionary per word: babel's last language or `main=`,
    polyglossia's, `\selectlanguage` to its group's end, `otherlanguage`, `\foreignlanguage`,
    `\text<language>`; a language without a dictionary is not checked. *On the page.* A red wavy
    line (a CSS highlight, nothing in the text); the right click menu, and a long press on a
    phone, give Hunspell's suggestions, Ignore All, Add to Dictionary and Spelling…; a suggestion
    changes only the letters that differ (inside `\textbf{wr}onng` the bold stays), one undo;
    the word being typed is marked once the caret leaves it. Add to Dictionary writes the word on
    a `% rikuy: words …` line of the main file (before `\begin{document}`; a second line past 90
    characters): the document's own list travels with the .tex to a coauthor, git and Overleaf,
    which Word's dictionary on one computer does not; cspell's `% cspell:words` lines count too.
    Ignore All is this browser's, per project; Recheck Document clears it. The Spelling pane (F7)
    is Word's: the word in its sentence, suggestions, Ignore Once, Ignore All, Add to Dictionary,
    Change, Change All, Previous, Next; a sheet on a phone. Review › Proofing Language puts a
    selection in `\foreignlanguage{…}` (the language added to babel's options before the
    document's, or `\setotherlanguage`) or sets the document's (babel's last option replaced,
    polyglossia's `\setdefaultlanguage`, or `\usepackage[british]{babel}`), and takes a
    `\foreignlanguage` off again. *Timing.* 141 kB of prose where nearly every word differs
    (15,840 distinct): the worker checks them in 65 ms; from the page's build to its marks 0.5 s;
    after a keystroke 0.2 ms on the page's thread (a block's words are kept by its key); 20,000
    words in node 0.2 to 0.35 s; the bench paper `dev/bench/long` (144 kB) 17 ms in the worker.
    *Review.* Track Changes (Ctrl+Shift+E, Word's key: it no longer makes an equation; the
    status bar's "Track Changes: On" too) is a switch on the review base: on, edits are changes
    to accept or reject; off (the default, as Word's), an edit goes into the base as well where
    it touches no change waiting, so it is no change and the changes waiting stay (a Reject, its
    undo and redo are never absorbed). A coauthor's link opens with it on. Display for Review
    (Simple Markup: bars; All Markup; No Markup), Show Markup (Insertions and Deletions,
    Comments); Accept and Reject as split buttons (and move to next, this change, all, all and
    stop tracking), Previous and Next Change (the change selected); Delete Comment, Delete All
    Comments (one undo), Previous and Next Comment, Edit Comment (right click on its line), Show
    Comments; Inspect Document (comments with their authors, changes waiting, the word list);
    Word Count (Ctrl+Shift+G: pages, words, characters with and without spaces, paragraphs,
    lines as the page breaks them, of the selection too, footnotes and captions in or out);
    Read Aloud (Ctrl+Alt+Space, the system's voices, in the document's language); Compare with
    a version or a .tex file; Save Version and Versions; Download with Markup: the main file
    with `\added`, `\deleted`, `\replaced` (changes package) where the words are plain text and
    the comments as todonotes' `\todo`, which compiles in the page; the status bar says the
    proofing language and the count of spelling errors. `prefs.marks` was two things (B2's Show
    marks and the changes on the pages): the changes now have `prefs.markup`. *Not done.* RV2
    (grammar): Harper is Rust, not C or C++, and an L of its own; RV3 (thesaurus): MyThes is
    C++, but the English data is 13 MB more for the hosted copy and no smaller source was found
    in the time; RV21 (a "comments only" share link) needs a role in share links (`share.js`),
    no cheap change; Display for Review's Original, and accept or reject by author (changes are
    one difference to one base, with no author of their own). *Security* (quick review, outside
    the repository): a run of closing marks made the words' trimming take squared time on the
    page's thread (200,000 marks: minutes); a chunk past 128 characters is now skipped whole,
    with a test. *Evidence.* `npm test` with `spell` (6 groups; with the corpus 7);
    `test/spell.py` 86 and `test/review.py` 63 (the copy with markup compiled with pdfLaTeX in
    the page), `history.py` 39 and `share.py` 46 (Track Changes turned on where they edit);
    `tabs.py` 115, `ribbon.py` 195, `agent.py` 143 (its llms-full.txt check now says Ctrl+Shift+E
    is Track Changes), `browser.py` 193, `find.py` 76, `offline.py` 58, `launch.py` 18,
    `pages_check` and `actionlint` clean; the artifact's build has no `spell/`. Screenshots in
    `/tmp/B10-shots`.
    *After the hostile review* (6 High, 6 Medium, 8 Low, each reproduced; every case is now a
    check of `test/review.test.mjs`, `test/spell.test.mjs`, `review.py` or `spell.py`): whether a
    step goes into the base is decided when it is made (`h.abs` in `record`) and its undo and redo
    do the same, so an undo and redo of a merge or a Word import no longer accepts it (H1), a
    tracked edit stays tracked through off, undo and redo (H2), and an untracked edit undone with
    tracking on leaves no phantom (M1); `absorbText` takes each piece of a step by words and
    characters, so Reject All no longer reverts untracked edits sharing a line or a step with a
    change (H3); Accept is a step Ctrl+Z takes back (M1); a merge or a Word import keeps your own
    waiting changes (M2); another tab's text is never absorbed and brings that tab's base (M3);
    leaving writes the base (M4). Proofing Language refuses a selection across `&`, `\\`,
    `\item`, `\verb` or an environment's edge (H4), keeps babel's last language the document's
    own (a French document stays French; H5, M5), keeps a language the text still uses loaded
    (L5) and polyglossia's British variant (L6). The Spelling pane's Change works from the text
    as it is, once per press (H6), and Enter on a suggestion is Change (L3). A language without a
    dictionary keeps the browser's own spelling and is named in the status bar (M5). Download with
    Markup marks only prose after `\begin{document}` (M6). `\-` no longer splits a word (L1);
    circuitikz, tcblisting, Sweave and `\iffalse` are code (L2); a dictionary that failed is asked
    for again on Recheck and when the network is back (L4); comparing with a version, a file or
    a commit tracks from it (L7); the old `prefs.marks` becomes All Markup once (L8).
    `history.py` 40 (Accept's undo is a step of its own), `review.py` 77, `spell.py` 90,
    `review.test.mjs` 5 groups, `spell.test.mjs` 6; the incremental oracle (`INCR_FULL=1`) 32,
    `view.py` 108, `browser.py` 193, `ribbon.py` 195, `share.py` 46.
    *After its verification* (1 High, 2 Medium, 3 Low): Proofing Language on words already in
    `\foreignlanguage` with babel on a shared line says why instead of writing
    `\foreignlanguageundefined` (V-H1); `absorbText` tests each piece against the waiting
    changes' own word operations, never their merged ranges, so the one word between two changes
    a word apart is absorbed (V-M1); the stored base carries a count, a tab writes only over the
    base it last read and takes a newer one on coming back, so one tab's switch or Accept reaches
    the other (V-M2, tested with two pages); `\Verb` and `\path` are refused (V-L1); the line
    hunks and word operations are kept from one keystroke to the next, so with 1,500 changes
    waiting in 127 kB a keystroke takes about 3 ms after the first (120 ms; it was 77 ms each,
    V-L2), the kept ones equal to fresh ones over 200 random keystrokes; Compare and git's "Show
    what changed" say Track Changes is on (V-L3). `review.py` 83, `review.test.mjs` 6 groups.
47. **B9, references as in Word.** Done in the code (branch `wordgap-b9-refs`), rows R1, R3, R5 to
    R7, R9 to R12, R14 to R18, I19 to I21 and C7 of the gap list (task 38); R19 (Table of
    Authorities) skipped: a second imakeidx index is cheap to write (`\index` and `\printindex` now
    read their `[name]`, and the page draws `\printindex[auth]`), but Word's Mark Citation needs its
    own categories dialog, left for later. *Contents.* Table of Contents writes `\tableofcontents`
    after the caret's paragraph; its arrow sets Show Levels 1 to 4 (`\setcounter{tocdepth}{n}`, a
    chapter class one less) or takes it out; the page's contents honour tocdepth, leave starred
    headings out, show `\section[Short]{…}`'s short title and `\addcontentsline` entries, as TeX's
    .toc has them. Add Text: Do Not Show (`\section*`, B4's command), Level 1 to 3, Text in the
    Table of Contents (a short title). *Notes.* Insert Endnote (Ctrl+Alt+D, not on a Mac):
    `\endnote{…}`, enotez and `\printendnotes` once; its mark opens a box for its words; the page
    draws the notes where TeX prints them (enotez's numbers in the margin, the endnotes package's
    raised). Next and Previous Footnote and Endnote, Show Notes. The Footnote and Endnote dialog:
    number format (`\renewcommand{\thefootnote}{\roman{footnote}}`), start (`\setcounter`), restart
    each section (`\counterwithin*`), each chapter or continuous in a report (`\counterwithout`),
    each page (footmisc's `perpage`), convert all footnotes to endnotes and back; the page numbers
    them as TeX does (per page stays continuous on the page: it depends on TeX's page breaks).
    *Sources.* Add New Source (Word's Create Source by type) appends a correct entry to the .bib
    the document reads (refs.bib, natbib, plainnat and `\bibliography{refs}` where it reads none)
    and cites it, one step; Manage Sources lists, cites, edits, copies, deletes (not a cited one)
    and takes pasted BibTeX. A hand written entry is edited field by field (`bibFieldEdits`): only
    the changed values move, its braces or quotes, padding, commas, comments and line ends kept.
    *Style and bibliography.* Citation Style offers the system's own styles (natbib's .bst, plain
    BibTeX's, biblatex's apa, chicago-authordate, ieee, mla, authoryear, numeric, alphabetic: never
    mixed; a hand written thebibliography says why not); Bibliography inserts it, retitles it
    (Bibliography, References, Works Cited: `\printbibliography[title=…]` or `\renewcommand{\refname}`
    before it) or takes it out; the page shows its title. *Captions.* Insert Caption: in a figure or
    a table, `\caption{…}\label{…}` below or above (after `\centering`); a centred picture or a table
    on its own becomes a float with `\centering`; numbering by section (`\counterwithin`); refused in
    multicols and longtable with the reason. Insert Table of Figures and List of Tables, drawn from
    the captions with their short titles and page numbers (`\caption*` left out). *Cross-reference*
    (Insert and References): heading, figure, table, equation or bookmark; number, page, and the
    name or above/below only where cleveref, hyperref or varioref is loaded; a label written where
    the target has none, in the same step. *Index.* Mark Entry (Alt+Shift+X): main entry, subentry,
    see, a page range (`|(` and `|)`), bold or italic page, Mark All; imakeidx and `\makeindex` once.
    Insert Index (columns); the page draws makeindex's index from the entries, page numbers from
    its own pages. *Links.* Ctrl+K is Word's Link (the insert list keeps `\`): web page (`\href`,
    `\url` when the words are the address), e-mail (`mailto:`), a place in this document
    (`\hyperref`, a label added), hyperref with hidelinks once; Edit Hyperlink in a link or on a
    clicked `\url`, with Remove Link, Open and Copy (the right click menu's link items too).
    Bookmark: `\label` (`\phantomsection` in running text with hyperref), Go To, Delete.
    Shared files: `model.js` (tocdepth, short titles, captions, endnotes, the index, the
    bibliography's title, footnote formats and `\counterwithin`; a second build when they change),
    `render.js` (the index, the notes, the lists' heads, the endnote mark), `parser.js` (`\endnote`,
    `\index[name]`, `\printindex[name]`, `\printendnotes`), `app.js` (two lines), `ui/menu.js`
    (the link context). Security quick profile: two low availability findings on a stranger's
    document fixed with tests (bounded note conversion; repeated `\printindex` and notes drawn
    within bounds). Evidence: `test/bib.test.mjs` 50; `test/refs.py` 210 (phones at 390 and
    360 px; with `dist/tex` everything written compiled with pdfLaTeX, XeLaTeX and LuaLaTeX, and
    biblatex's apa with biber); the corpus model run 716 of 716; `native.test.mjs` with the corpus
    the same trees and models; `agent.py` 143 (Ctrl+K's Insert Hyperlink a dialog of its own), `tabs.py`
    115 (the References tab's split buttons lose their names as the row folds: every width from
    390 to 1920 px monotonic), `ribbon.py` 195 (Link opens its dialog), `browser.py` 193, `features.py` 36,
    `npm test` green. On the incremental model build (task 53): the contents' entries are one
    function both builds use (`tocList`), a list of figures is no table of contents to refresh,
    captions', endnotes' and index entries' places are numeric `f` and `s` fields the fast path
    moves (headings' `e` too), the index's page numbers are read from the model at each layout;
    `incremental.test.mjs` gains a references document (its long streams: 6400 edits the same).
    Ctrl+K left the insert list, whose title says `\` alone.

47a. **B9 review: every finding of the hostile review of 25c4b9c fixed, each with its case as a
    test.** Edit Source writes only a field the user changed, compared as the .bib holds it (a value
    over several lines in a box that keeps its lines), text typed into an empty field alone escaped
    and never inside math; a quoted value changed is written in braces, its `\"u` kept (H1, H2).
    Insert Caption reads `\counterwithout` and writes the numbering only when it was changed, and
    keeps a `\counterwithin` or `\numberwithin` where it stands (H3, M1); the Footnote and Endnote
    dialog shows a document's own format and `\numberwithin` as its own and Apply with nothing
    changed writes nothing (H4). A link over two paragraphs is refused (H5). natbib offers only
    its own .bst, numbered ones with its `numbers` option set and taken off again (IEEEtranN for
    IEEE), the page drawing them numbered (H6). Symbols past nine and letters past 26 footnotes
    are refused with the reason unless they restart each page (H7). biblatex, natbib and their
    resources are read from the files the preamble reads, so a project's .sty with biblatex gets
    `\printbibliography` and nothing else (H8). The contents list `\part` and read a tocdepth set
    in the body, and Show Levels edits that line (M2, M3); subcaptions are (a), (b), out of the list
    of figures, and a figure with them takes its own caption (M4, L6); footmisc's perpage drawn,
    each page's notes from 1 (M5); an entry another crossrefs is not deleted (M6); a short title or
    a biblatex title holding a bracket goes in braces (M7); a .bib address keeps `#` and `%` bare,
    as url.sty and biblatex read it, and an edited one keeps its address (M8, L4); the index's page
    is the page of the words before each entry, entries after `\printindex` come from the build
    before as TeX's .ind does, blocks found by halves (M9, L12); a field added to `@misc{k}` goes
    inside it (L1); Ctrl+K is Link alone (L2); imakeidx goes above hyperref (L3); a caption goes
    before a figure's lone `\label` (L5); converting leaves notes in headings and captions (L7);
    tocbibind, KOMA-Script's `toc=`, memoir's unstarred lists and biblatex's `heading=bibintoc` put
    their entries in the contents (L8); `@comment` counts its own brackets (L9); a report's
    `\counterwithin{footnote}{chapter}` draws 1.1 (L10); a link's words changed keep its address's
    bytes (L11). The rebase notes R1 to R3 hold with their tests (a label added after typing above
    the figure lands after its caption; typing beside a list of figures stays on the fast path; a
    reused index block's page numbers follow). Evidence: `bib.test.mjs` 63, `refs.py` 236 (24
    review cases, four of them compiled: IEEE under natbib, biblatex from a .sty with biber, a short
    title with a bracket, an edited url with `#` and a quoted accent).

47b. **B9 verification: what the verifier of 47a found, fixed with its cases.** Edit Source escapes
    exactly the span typed into a field it showed as LaTeX (`&`, `%`, `#`, `_`, a lone `$`, `~`,
    `^`), never inside math and never what was there (V1, V10); compares and writes a CRLF file's
    lines as the file has them (V3); refuses unbalanced braces before the dialog closes (V9). An
    address with `#` or `%` in a BibTeX or natbib document brings `\usepackage{url}` in the same
    step where neither url nor hyperref is there (V2: plainnat's own `\url` stops at them). Per
    page footnote numbers leave `\thanks` alone (V4); an index entry at the end of a paragraph cut
    over two pages takes the page of its half (V5); `ieeetr`, `plain`, `unsrt`, `abbrv` asked for
    under natbib become its numbered forms and `alpha` is refused (V6); an author and year style
    takes `\setcitestyle{numbers}` off (V7); `\footnotemark` counts toward the symbols' nine (V8).
    Rebased on e309a85. Evidence: `bib.test.mjs` 71, `refs.py` 244 (8 new cases, one more
    compiled: a typed `&` and `%` and an address with `#` and `%` in natbib). The References
    commands' when and on read the preamble, the bibliography's set up and every file's body once
    for each text of the project (`perText` in `src/cmd/refs.js`, the comment-blanked preamble and
    body once per string in `src/refsrc.js`): on `page.py`'s long document a look at the caret
    went from 349 to 12 ms, Citation Style from 83.6 ms to under 2; `refs.py cached` checks every
    References command under 2 ms there and its answers equal to a fresh read after edits to an
    `\input` file, to the main file and a change of main file (`refs.py` 251).

60. **Tag the PDF.** Done in the code (branch `round3-r0-tagpdf`). `tex/build_tree.py` dropped every
    `.html` file as documentation, and with it tagpdf's `latex-list-css.html` and
    `latex-align-css.html` (TeX Live 2026 keeps them in `tex/latex/tagpdf/`, not latex-lab): CSS a
    tagged PDF embeds for its lists and alignment, so every `\DocumentMetadata{...,tagging=on}`
    compile stopped at `\end{document}` with `Package pdffile Error: File 'latex-list-css.html'
    not found`. `KEEP_ANYWAY` now keeps `tex/latex/tagpdf/*.html` (the copies of
    `texlive-latex-base`); nothing else was missing: the same tagged document (title, lists,
    `center`, an equation, a table, a footnote, a reference) compiles in the page with no error on
    pdfLaTeX, XeLaTeX and LuaLaTeX (`dev/texrun.py`) into a PDF 2.0 with a structure tree,
    `/MarkInfo` marked, `/Lang (en)` and both CSS files attached. The tree and packs were rebuilt
    from the inputs on this machine with Ubuntu 24.04's `libz.so.1.3` in `LD_PRELOAD`;
    `dev/dist-manifest.txt` changes by three lines only: `tree.wasm`, the core pack with `ls-R`
    and the pack with `tex/latex/tagpdf` (+515 bytes in all; the artifact's copy, the
    other scripts' packs left out, is 254.1 MB of its 256). File › Check accessibility offers Tag
    the PDF again: it writes `\DocumentMetadata{lang=..,pdfstandard=ua-2,tagging=on}` on the line
    before `\documentclass`, or puts `tagging=on` among the keys of a `\DocumentMetadata` already
    there (`kvEdits`: `tagging=off` turned on, CRLF, comments and a `{...}` value kept); the check
    reads that `\DocumentMetadata` as TeX does (comments left out, braces balanced, so a group in
    a value no longer hides `lang` or `tagging` after it) and offers no button where its braces do
    not close. *Evidence:* `test/file.py` 87 with `dist/tex` and `dist/word` (the 77 before, the
    test that Tag the PDF is held back replaced by its round trips on four sources and the tagged
    document compiled on the three engines, each checked with pypdf); `npm test`, `test:offline`
    58, `test:agent` 143, `launch.py` 18, `deploy_check.py` 45, `pages_check.py` (382 files, 358.6
    MB), and the manifest diff empty.
61. **R1, what the paragraph (B2) and page (B6) batches left.** Done in the code (branch
    `round3-r1-pages`), every item of LEFTOVERS' R1 list. *Hand written marks:* `\markboth` and
    `\markright` are page marks of the model (they printed their words in the text before); the
    running head takes them in order with the headings' marks (TeX's first mark on the page for
    `\rightmark`, the last for `\leftmark`), none from headings under myheadings. *A paragraph
    without line numbers:* lineno's `nolinenumbers` lines get no number and are not counted;
    Layout › Line numbers › Suppress for current paragraph (Word's) toggles B2's setting.
    *Document info:* Header & Footer › Document info puts `\thetitle`, `\theauthor`, `\thedate`
    or `\jobname` where the caret is in the header, with the preamble's copy
    `\makeatletter\let\thetitle\@title\makeatother` written once after `\title` in the same step
    (the standard classes empty `\@title` at `\maketitle`; titling and memoir have their own, KOMA
    keeps it; titling itself was measured to move the title 10 bp, so it is not loaded); disabled,
    saying why, where there is no `\title`; drawn on the page; Word gets TITLE and AUTHOR fields
    and a foreign file's fields come in as the text Word shows. *A picture as the watermark:*
    Watermark › Custom watermark… › Picture watermark (a picture of the project or one chosen now,
    its width): draftwatermark's `text={\includegraphics[width=10cm]{logo.png}},angle=0` with
    graphicx, drawn on the page at its width; a text watermark after it starts afresh. Word's
    Washout has no form XeLaTeX keeps on the shipout background (the transparent package needs
    `\DocumentMetadata` there, pgf's opacity is lost by xdvipdfmx: measured), so the picture is
    set as it is. *Art page borders:* Page borders › Style (Single, Double, Dashed, Dotted: TikZ's
    `double,double distance=2pt`, `dashed`, `dotted`) and Art (Dots, Diamonds, Stars:
    decorations.markings' marks at a fraction of the border's length, so they close up where they
    start, the library once), drawn as an SVG reproducing TikZ's path, dash phase and the marks'
    turns; to Word as `w:pgBorders` line styles and art (starsBlack, diamondsGray), back as TikZ.
    pgfornament was not used: the page could draw its ornaments only by shipping their paths (its
    `.pgf` files, LPPL) into the page. *Landscape pages for part of a document:* Layout ›
    Orientation › Landscape pages for the selection writes pdflscape's `landscape` around the
    selected paragraphs (Portrait pages here takes it out to the byte); the page sets its text on
    pages of their own as tall as the text is wide and draws them on their side, the header and
    footer down the sides, as a reader shows pdflscape's turned PDF pages. *Columns for part of a
    document, Word's sections:* a multicols part or a landscape part is a Word section of its own
    (continuous, its columns or its turned sheet; the headers with the first section), and a
    foreign Word file's sections other than its last come in as multicols (ended around floats)
    and landscape (where its last section is landscape, the whole document is, as before). The
    header and footer of a landscape page are typed on the nearest upright page. *Tab stops at positions:* Tabs… sets stops (cm): the paragraph becomes a
    tabbing whose first line sets them (`\hspace{2cm}\=\hspace{3cm}\=\kill`), changed in place,
    taken off with the environment it added; Tab in a tabbing goes to the next stop (`\>`), Enter
    starts its next line (`\\`), Layout › Paragraph › Next tab stop does Tab's work on a phone;
    the model reads a tabbing (written by hand too, its stops set by its words) line by line with
    its fields at TeX's stops (the parser reads `\=` as the macron accent, so the environment is
    read again with it as `\>`). Leaders at a position and right, centre or decimal stops: tabbing
    has none (the right margin's leader stays B2's). *Fills to the margin:* `\hfill`, `\dotfill`,
    `\hrulefill` take what their line leaves, shared among a line's fills. *Club and widow lines:*
    a page break leaving a paragraph's first line alone at the foot or its last at the next top is
    weighed as TeX weighs it, `\clubpenalty` and `\widowpenalty` (LaTeX's 150, nowidow's, the
    preamble's) against the badness of the page stretched without that line (ragged pages never
    badly, flush ones by their paragraphs' and headings' stretch); and a page holds
    `(\textheight - \topskip) / \baselineskip + 1` lines, as TeX's first line stands `\topskip`
    below the text's top (the page held a line less where the classes make the height just
    that). *Show marks:* a dot in each space, a degree sign in each `~`, a bracket where a `\label`
    stands, drawn over the pages in sight from each character's source, taking no room (the ¶'s
    padding, which pushed a full line's last word to the next, is gone). *A foreign Word file's
    paragraph settings:* left aligned where the document justifies (flushleft), its own line
    spacing (setspace's environments; a document's own from 1.25 lines up in the preamble, Word's
    defaults of 1.08 and 1.15 lines left as LaTeX's single), indents (adjustwidth; a hanging indent
    as `\noindent\hangindent`, the paragraph's indent hidden from pandoc, which made indented
    paragraphs quotations) and suppressed line numbers (nolinenumbers where lineno numbers lines),
    neighbours sharing one environment; and No Line Numbers to Word. *Security:* the quick
    profile (notes outside the repository) found four, fixed with tests: a tabbing's second read
    padded with the file before it (now a budget of 20 million characters a build), an art
    border's step from a stranger's Word sheet of 1e9 twips was 0 (TikZ loops for ever; now 8 to
    1000 marks), the watermark's picture list offered asset names TeX would not read as written
    (only plain names now), a paragraph of thousands of fills measured quadratically (200 at
    most). Also: the page dialogs opened from a hidden button (a phone, the search box) were not
    placed at all; they stand by a rect now and scroll within the screen. Evidence: `npm test`
    green (`page` 32 groups, `para` 29, `word` 68 with three new: a foreign file's settings,
    sections both ways, art borders and header fields; `incremental` with an R1 document),
    `para.py` 254 and `page.py` 175 with `dist/tex` (R1's: every construct compiled with
    pdfLaTeX, XeLaTeX and LuaLaTeX; TeX's PDF with the landscape page turned and its first word
    where the page draws it, the hand written mark and the title in the header, the tabbing's
    fields and the filled word where the page draws them, the club line where the page ends its
    page; phones at 390 and 360 px with touch; screenshots in `/tmp/R1-shots`).
61a. **R1 review: the findings of the hostile review of 6bb2975 fixed, each with its case as a
    test.** H1: the `\topskip` allowance and the plan's 1.5 px tolerance together let a page hold
    more than TeX's (a memoir document went from 12 pages, matching TeX, to 10): the tolerance is
    taken off where the allowance is added (the memoir document in `page.py` `r1_review`, 12 pages
    each starting with TeX's words). M1: a tabbing is read again by itself, its offsets moved to
    the file's, with no padding and no budget, so a full build and an incremental one read every
    tabbing alike (past the old budget the full build ate the letter after each `\=`;
    `incremental.test.mjs`). M2: a LibreOffice Word file names its Normal style without
    `w:default`: the paragraph style called Normal is taken (every paragraph had come in wrapped in
    `spacing{1.15}` and hand set left alignment was lost; `word.test.mjs`, and the review's file
    gives no setspace and its three flushleft paragraphs). Lows: L1 `\+`, `\-` and `\<` move a
    tabbing's lines to their stops; L2 the standard classes' two columns are flush bottomed; L3 a
    turned Word section keeps its header and footer inside its own top and bottom margins. L4
    (inside landscape pages with a footnote and an [h] float the cuts differ from TeX's) is left: the
    review did not trace it. Evidence: the review's page break table on its 26 no-wrap documents:
    page starts agreeing with TeX's 214 of 303 (R1 210/301, main 152/304), page counts equal 17
    (R1 16, main 16), memoir 12 pages 9/9 again. After its verification (merge): N1 a group the
    parser hands `\<` or `\+` as an argument is the field's text again; N2 `shiftNodes` moves `ne`
    too; N3 it has no cap, which could leave a long tabbing half moved (`page.test.mjs`).
62. **R2: what the Font (B1), Lists (B3) and Styles (B4) batches left undone.** Done in the code
    (branch `round3-r2-styles`, on main e863372), every item of the round 3 list.
    *Font.* Clear All Formatting takes the paragraph's own settings off with the characters'
    formats, as Word's goes back to Normal: B2's alignment, line spacing, indents, first line
    (`\noindent`, `\hangindent`), space before and after, keep with next, page break before,
    samepage, no hyphenation, line numbers, shading and box (Rikuy's tcolorbox) and rules, each by
    B2's own edits over `paraRun` (`paraReset` in `src/cmd/font.js`); what comes from further out
    (a `\centering` above, a center around two paragraphs) stays; where B2 cannot read the
    paragraph (a heading, a list item) the old alignment step still runs; characters and paragraph
    are one step of history (`fmtOneStep` joins the commits a command makes). The Format Painter
    armed from a caret, or a selection of a whole paragraph, carries the paragraph's style (a
    heading, a quote, a theorem, Normal) to the paragraphs it paints, the words painted kept
    selected, in one step; a double click keeps painting until Escape, as before; words selected
    inside a paragraph carry their characters alone, as Word's do without the paragraph mark.
    Underline Color takes any colour: More colors in the picker and the Font dialog write
    xcolor's mix (`\culine{rgb,255:red,231;green,84;blue,128}{..}`, which Rikuy's `\culine`
    passes to `\textcolor`), the page draws it (`colorArg` reads the mix), the dialog shows the
    colour an underline has. Word import keeps the highlighter's colour: `premark` marks a run's
    `w:highlight` other than yellow (seven digits, which no colour mark has) and the LaTeX's `\hl`
    takes it: `\hl[green]`, xcolor's names for Word's teal, violet, olive, grays, and the mix for
    its dark blue, green and red, read back by the page and Word export.
    *Lists.* Define New Bullet › Picture… (Picture Bullet, also in the library's menu): a picture
    of the project, or one from the device put into the project (`figures/`, a name TeX takes) in
    the same step, as `label={\includegraphics[height=1.6ex]{..}}` with graphicx; the page draws
    the picture on each item. Adjust List Indents (the library's menus and the right click menu):
    enumitem's `leftmargin`, `labelwidth` and `labelsep`, shown as the list has them or LaTeX's own
    at its level, with the bullet's position worked out; OK writes the three, LaTeX's own takes
    them away, a hand written set changed where it stands; refused beside the enumerate package,
    paralist and beamer. The page draws the text at the margin and the label's box labelsep before
    it, a nested list from that margin (`Builder.listBlock`'s `lm`); TeX puts them there on the
    three engines (`lists.py r2_pdf`, pdftotext's boxes against the page's). Word export gives
    every bulleted list the bullet the page drew, nested ones too: pandoc gives each list its own
    numbering on one abstract list of Symbol and Wingdings bullets, and `bulletDocx` gives each a
    copy with its level's bullet the page's character (lists counted the same on both sides, else
    nothing changes). A picture bullet goes to Word as a round bullet (Word's picture bullets,
    `w:lvlPicBulletId`, are not written).
    *Styles.* Code (H65): the paragraph in verbatim, only on words verbatim prints the same (no
    special, no blank line, no dash or quote ligature), so Normal again gives the bytes back; a
    press on a Code block selects it as a picture is (the gallery and the list show Code), Normal
    makes it text (a hand written verbatim's specials escaped), a second press or Enter opens its
    source as before. Subtitle, Author and Date (H63), with Title: a paragraph of the body made a
    part of the title block (`\title` with `\maketitle` in the paragraph's place where there is
    none; `\author`, joined by `\and`; `\date`; KOMA-Script's `\subtitle`, else
    `\title{Main\\[0.5ex]\large Sub}`); the caret in a part shows its style, Normal makes it the
    paragraph after `\maketitle` again (the title only where it stands alone), each the other's
    way back byte for byte; the page draws the subtitle, Word gets it as Subtitle. Title shows in
    More and the style list for a document with no title. Rename Style (H74): a style of the
    document's own (the Styles pane's Rename…, `rename-style`): its definition, `\begin` and
    `\end`, a theorem numbered with it, cleveref's names, its counter's uses, or every `\cmd`,
    in every .tex and .sty of the project, comments and verbatim left as written, the new name
    checked as Create a Style checks one. The links' colour (D1): Colors writes
    `\hypersetup{colorlinks,linkcolor=accent,urlcolor=accent,citecolor=accent}` after the accent
    where hyperref is loaded (a `\hypersetup` of the document's own takes the keys in place,
    `hidelinks` off), Black takes them away; the page draws references, citations and addresses
    in hyperref's colorlinks colours, a hand written `[colorlinks,linkcolor=blue]` too
    (`Builder.linkColors`). A float between `\paragraph{Lead}` and its text: the heading runs into
    the text as TeX runs it (`runIns` passes floats), the page draws the float first
    (`App.layoutPass`). B4's tests changed only where R2 changes what they saw: the title alone
    offers Normal, the lists and More have Title (untitled documents), Subtitle, Author, Date and
    Code.
    *Phones* (390 by 844 light, 360 by 740 dark, touch): Clear All, the Format Painter's style and
    Underline Color's More colors by taps; Picture Bullet and Adjust List Indents from the
    library's menu, in the screen with 44 px tiles, fields and buttons; a tap selects a Code block
    and the style list takes it off; Author from the style list; Rename Style fitting, its Close
    44 px. *Security* (the audit skill's guidance on the changed files, notes outside the
    repository): a `.docx` highlight value naming a member of Object's prototype (`constructor`)
    wrote junk characters into the imported LaTeX (now a key of the table alone), and a paragraph
    ending in a comment made a title part left `\author{..}` open (now refused, as are braces that
    do not close); both with a test; every new scan of a stranger's text bounded (the
    `\hypersetup` reader, `titleInfo`, `renameEdits`), checked with timings. Evidence: `npm test`
    green (`font` 28 groups, `lists` 25, `styles` 28, `looks` 11, `word` 68, `incremental` 32 on
    11 documents with one of R2's constructs, `native` 43); `font.py` 305 (272: `r2`, its phones,
    `r2_compiles` on pdfLaTeX, XeLaTeX and LuaLaTeX); `lists.py` 218 (184: `r2`, `r2_pdf` on the
    three engines, `r2_phone`); `styles.py` 399 (320: `r2`, `r2_compile` on the three engines and
    KOMA's subtitle, `r2_phone`); `para.py` 204; `tabs.py` 115; `ribbon.py` 195; `agent.py` 143;
    `browser.py` 193; `word.py` 111; `page.py long_document` 6 (every command's when and on 18 ms
    together, none over 5); `launch.py` 18/18; `deploy_check.py` 45/45; `pages_check.py` fits; the
    corpus model run 716 of 716 with main's unknown commands. `offline.py` passed every check up to
    the offline compile, whose TeX warm up timed out in a copy of `dist/` made of links (this
    worktree's `dist/tex` is a link to another's); R2 changes only llms-full's text in
    `build/app.mjs`. Screenshots outside the repository.

62a. **R2 review: every High and Medium finding of the hostile review of 1d96496 and dfcd1cd fixed,
    each with its case as a test; the small Lows too.** H1: a float between `\paragraph{Lead}` and
    its text was moved before the heading in the page's order, so Delete at the heading's end and a
    selection from it into the text deleted the float's words unseen (main, with no run in there,
    had no such path; this branch made it reachable). The items now keep the source's order, the
    float is drawn between and shown selected when a selection holds it, and the heading, which takes
    no height, is shifted onto its text's first line (`App.runInOverFloats`). H2: Code goes only on
    one line no longer than a line of the text in typewriter characters (`codeCols`), and a
    verbatim's lines are drawn unbroken, as TeX sets them. H3, M1: the links' colour is a line of
    Rikuy's own, after the last of the accent, hyperref's `\usepackage` and the document's own
    `\hypersetup` lines, which stay as written; Black takes away that line alone (`hidelinks` and
    `colorlinks=false` come back). H4: `titleInfo` reads the body before `\maketitle` too (the last
    of each command, as TeX takes it); a new part's line goes beside a `\title` in the body; a
    paragraph before `\maketitle` is no part of it. M4: a title set in a file the preamble reads
    refuses every part, naming the file. H5: Rename only for what the project makes itself
    (`createsOwn`: `\newcommand`, `\def`, `\newenvironment`, `\newtheorem` and the theorem
    makers), never a `\renewcommand`. H6: the counter's every name is renamed (`\newcounter` and
    its `[within]`, both arguments of `\numberwithin`, `\counterwithin`, `\counterwithout`,
    `\@addtoreset`, `\newtheorem`'s within, thmtools' `sibling=`, `numberlike=`, `sharenumber=`),
    a command in the .bib files too; a fancyvrb Verbatim with commandchars that runs the command
    refuses the rename. M2: the Format Painter gives the carried style to a paragraph clicked or
    selected whole, never to a few words selected in one. M3: a key typed on a selected Code block
    opens its source (a phone's text through beforeinput), where it replaced the block. Lows: the
    join at history's cap drops one step, not two, and leaves no step for Track Changes (L1); Code
    refuses < > |, two spaces, tabs and several lines (L2); Rename refuses where LaTeX's own names
    derive from the old one (`\theta` for an environment `ta`, `\endinput` for `input`) and skips
    `\lstinline`, `\url`, `\path`, `\mint` (L3); Normal leaves an `\author{}` or `\date{}`
    placeholder and refuses a part holding `\thanks` (L6). Not done: L4 (a highlight's colour in
    the title, author or abstract of a .docx, and two adjacent runs of two colours, which pandoc
    joins in one span), L5 (link colours set in an `\input` preamble file are not drawn): each needs
    more than a small change, and nothing breaks without it. Evidence: `styles.test.mjs` 29 groups,
    `looks.test.mjs` 11; `styles.py r2_review` 18 (H1 to H6, M1, M3, M4, L3; H3, H4 and H6's
    documents compiled in the page), `font.py r2_review` and the M2 cases in `r2`.

62b. **R2 verification: what the verifier of ffa732e found, fixed with its cases.** N1 (a
    regression of L3): Rename took TikZ's `\path (0,0) node {..}` and `\path[draw]` for url's
    verbatim `\path|..|` and left the commands in their nodes; url's `\path`, `\url` and
    `\nolinkurl` now take no option and only a brace or a punctuation delimiter, never `(` or `[`.
    N3: hyperref loaded by a file the preamble reads or a package puts the links' line right
    before `\begin{document}` (`\RequirePackage{hyperref}` counts as loading it). N2: Rename
    checked derived names against LaTeX's list of 88 packages' names, which holds
    `\endtheorem` and `\lbl` for packages the document does not load, and refused its own
    `\newtheorem{theorem}`: now `\theold`, `\c@old` and `\p@old` are renamed only where the
    environment has that counter (`makesCounter`; `\theta` stays for an environment `ta`), and only
    an `\end` form of TeX's own (`\endinput`) refuses; `rename-style` with `{ v }` runs wherever the
    caret is, and a document's own `\newtheorem{theorem}` can be renamed. Evidence: `npm test`
    green (`styles.test.mjs` 29 groups, `looks.test.mjs` 11); `styles.py` 422 (`r2_review` 23: N1's
    TikZ document and N3's project compiled in the page). N4 (from the verification of 8d2e842):
    renaming a theorem turned `\renewcommand{\theoremautorefname}{Thm}` into a renewal of a name
    hyperref never defined, and TeX stopped; a renamed `\…autorefname` or `\…name` that a
    `\renewcommand` set is written with `\providecommand` (the document compiled in the page,
    `\autoref` printing "Thm 1").

63. **R3, round 3 of the Word gap: what Tables (task 45), Pictures (46) and Insert (49) left.** Done
    in the code (branch `round3-r3-objects`), every item of the R3 list.
    *Tables.* A table's alt text: LaTeX's tagging (latex-lab's table module in TeX Live 2026) has
    no field for one (its keys are tagging, header rows and columns, multirow), so it is a
    `% alt: …` line just before the table, as pictures in graphics' own form have theirs: Table
    Alt Text (the search box, `{text}`) and Table Properties' new Description write, change and
    take it off where it stands (`tableAlt`, `setTableAlt` in `src/table.js`), and Word gets it as
    the table's description; the PDF's reader gets the caption. Height and Width are boxes on
    Table Layout's row (Cell Size): the rows' height as `\arraystretch` (as Properties writes it;
    LaTeX has no height of one row but a strut) and the caret's column's width as `p{…}`, Auto
    giving its letter back, read back as the caret moves. Word now gets a cell's shading
    (`\cellcolor`, `\rowcolor` over its row, `\rowcolors`' bands counted as the page counts them)
    and its words turned (`\rotatebox{90}`, `{270}`: btLr, tbRl): `src/wordast.js` keeps them in
    the AST's cell attributes, which pandoc drops, and `src/wordtable.js` writes them into the cells
    pandoc wrote, in the schema's order, after pandoc (the n-th table of the AST is the n-th
    `w:tbl`; a cell continued from one merged down is skipped).
    *Pictures and objects.* I12: a press on a drawing (Insert › Shapes, any TikZ picture the page
    draws) selects it with a handle on each point (a corner, a line's end, a circle's radius, an
    ellipse's two radii); a drag writes that coordinate alone, in cm to two places, the drawing
    redrawn meanwhile in its box (`tikzPoints`, `pointText` in `src/drawing.js`, `src/ui/shapes.js`);
    Escape gives up; a second press, a double click or Enter edits its source as before. Sizing
    the whole drawing at once (a `scale` handle) is not there: its points are. A chart Rikuy wrote
    reopens in its grid on a press (Edit Data, `chart-edit-data`), filled from its coordinates; OK
    writes it again in its place. P7: Border Weight (`\setlength{\fboxrule}{…}`, ½ to 6 pt,
    Automatic) and Border Color (`\color{…}` before the `\fbox`, xcolor, dvipsnames where the name
    needs it) in the border's group, read back and taken off where written; Picture Border and Reset
    take the whole group; the page draws the weight and colour. They are in the picture's right
    click menu (a long press on a phone) and the search box, not an arrow on the row: the arrow made
    the Arrange group fold at 870 px but not at 860 (`test/tabs.py`'s sweep). A round handle above
    the frame turns the picture by any angle (Shift: steps of 15°), one `angle=` when the press
    ends, by mouse or finger. The wrap's text flow: a wrapfigure goes into the paragraph after it
    as a CSS float on its side, the words beside it and then under it at full width, measured with
    it; that paragraph moves to a page whole (`wrapPairs` in `src/layout.js`). Not as wrapfig: a
    figure taller than its paragraph does not go on wrapping the next one.
    *Insert.* H82, drag to move: selected words dragged move there as one commit (the deletion
    Cut makes and the LaTeX Copy takes, inserted as Paste inserts it), Word's smart spaces, the
    words selected after; Ctrl (Option on a Mac) as it drops copies; a drop in another file moves
    nothing and says why; a drop from another page is its words and HTML through the paste path,
    never the LaTeX type it may carry. A selected picture is dragged by a press, mouse or finger:
    its environment (center, figure, wrapfigure, or a paragraph of its own) goes between the
    paragraphs at the point, a picture among words goes among words, a line showing where; one
    commit (`src/cmd/move.js`). Words dragged by a finger are not tested (Playwright drags no
    selection by touch): on a phone the long press menu's Cut and Paste move them. I1: Insert › Cover Page writes a
    titlepage first in the text in one of three designs (Plain, Sideline, Motion) with the
    document's own title, author and date (titling's `\thetitle`; memoir's own; words to type over
    where there is no `\title`); another design takes its place; Remove Current Cover Page takes it
    out, also a hand written one; refused in beamer. The page draws a titlepage as the classes set
    it: a page of its own, unnumbered, the text after it on page 1. I31: Quick Parts: Save Selection
    to Quick Part Gallery keeps the selection's LaTeX with the groups round its words (Word keeps a
    selection's formatting), per user in this browser (100 parts, 64 KB each, read back with caps);
    a part goes in at the caret, or after its paragraph when it is paragraphs, with the packages
    its commands need in the same step; the Building Blocks Organizer renames, deletes and inserts.
    I32 and I33: Quick Parts › Document Property (Title, Author, Date) and Field… (Page, NumPages,
    Section, Date, Time, FileName, Title, Author, CreateDate): `\thepage`, `\pageref{LastPage}`
    (lastpage), `\thesection`, `\today`, `\thistime` (KOMA-Script's scrtime: datetime2 changes
    `\today` to ISO dates), `\jobname`, `\thetitle`, `\theauthor` (titling; beamer's
    `\inserttitle`), drawn on the page as TeX prints them, a page's number and the pages' count
    filled in by the layout from the page each stands on (`src/fields.js`, `fillFields`); to Word
    as its fields PAGE, NUMPAGES, TITLE and AUTHOR. Word's SEQ and STYLEREF are not fields here:
    LaTeX numbers what it counts by its environments (captions, theorems), and the running heads
    are the header's (task 44). DV1: Form Fields (Word's content controls: plain text, check box,
    combo box, drop-down list, date) as hyperref's `\TextField`, `\CheckBox`, `\ChoiceMenu` with
    names of their own, labels escaped, in one Form round the text (XeLaTeX leaves a field outside
    a Form out of the PDF's form); the page draws them as boxes as wide as hyperref makes them; to
    Word as content controls (a check box as its character: Word's own needs a namespace pandoc's
    document does not declare). And: `{\Huge …}` and the other size declarations in a group are
    drawn at their size (they were drawn at the text's), as a cover page needs.
    Evidence: `npm test` green (`objects.test.mjs` new, 9 groups: fields drawn, cover pages each
    way, Quick Parts' storage and packages, form fields, the border's weight and colour, a
    drawing's points, a table's alt text, Word's table extras, a stranger's document in bounded
    time; `word.test.mjs` 67, two new with the real pandoc; `incremental.test.mjs` 32 with a
    document of these constructs in its streams, and with `INCR_FULL=1`), `test/table.py` 175 (14
    new), `test/picture.py` 216 (42 new: the round trip rule on Border Weight with hand written
    forms, the free turn by mouse and Shift, a drawing's point by mouse and Escape, the chart's grid,
    the wrap measured, a picture dragged as a block and among words, phones at 390 and 360 px by
    finger, and with `dist/tex` a picture bordered and turned 30°, a moved drawing, a rewritten chart
    and a wrapfigure compiled with pdfLaTeX, XeLaTeX and LuaLaTeX, the turned box in the PDF equal to
    the page's within 2.5 pt), `test/insert.py` 206 (every field one step and its package once,
    drawn with the pages' numbers; Quick Parts, the menu, the organizer, a stranger's storage; the
    cover page by the round trip rule; every form field; drag to move by mouse, Ctrl, across files,
    from another page; phones; with `dist/tex` all of it compiled on the three engines with the five
    fields in the PDF's form), `tabs.py` 115, `ribbon.py` 195, `agent.py` 143, `browser.py` 193,
    `widgets.py` 60, `word.py` 111, `font.py` 272, `page.py long_document` 6, the corpus model run
    716 of 716. Screenshots in `/tmp/R3-shots` (1920, 1366, 390, 360 px, light and dark). Security:
    the audit skill's agents could not be started in this session; the changed files were read by
    hand against its client side, injection and resource classes (notes outside the repository):
    no finding; a form field's options are read into an object with no prototype, and the bounded
    time of a stranger's document is a test.
    *Review* (a fresh hostile reviewer of fc36bf5: 4 high, 6 medium, 7 low; each fixed with its case
    as a test, compiled in the page where TeX is the judge, but L7): H1 Form Fields read the body's
    environments as TeX does (`formScan`: comments and verbatim skipped, nesting counted) and move a
    Form's tag only where it is the only Form and both its tags stand at the text's top level;
    otherwise the field goes in where the caret is and a toast says why (the four documents of the
    review compile); H2 memoir gets `titlingpage`, which Rikuy reads back and draws as a page of its
    own; H3 a pair whose figure went parts also when its paragraph is the first item; H4 a wrapped
    paragraph is cut across pages below its figure (its lines beside the figure count as one), never
    placed taller than a sheet. The wrap's styles and the form fields' boxes now hold in the measuring
    flow too (they were scoped to `#pages`, so the page had measured a wrapped paragraph without its
    float). M1 a deletion by drag (words dropped in a box of the interface, another tab or program) is
    ignored: they are copied there; M2 a size declared in a group is TeX's absolute size (`--fs`),
    `\normalsize` too; M3 a Quick Part's packages and definitions go through the Font group's
    `preambleFor` (ulem with normalem, `\dsout`, `\culine`, `\hl` defined once); M4 a figure
    taken from a paragraph's middle leaves one paragraph; M5 a figure taller than its paragraph goes
    on beside the next ones (`wrapGhosts`: an empty float of what is left, measured with them); M6
    words dragged out of `\textbf` (any wrapper) keep it where they go and take the space before
    the brace. L1 a picture dropped on a list goes before or after the whole list, the line drawn
    there; L2 a moved word next to a formula gets its space (a drop from another page is not spaced);
    L3 Cover Page asks before it replaces a hand written title page (`{replace: true}` for agents); L4
    the Form's end goes after the words on `\end{document}`'s line, and a body with no line's end
    after `\begin{document}` gets its Form; L5 a boxed table's alt line goes on the line above the
    box; L6 Firefox's `caretPositionFromPoint`. Not done: L7, wrapfig's `i` and `o` on two sided pages
    (the side depends on the page the figure lands on, which the model does not know: drawn as one
    sided). Evidence: `objects.test.mjs` 13 groups (4 new), `test/picture.py` r3_review 6 new,
    `test/insert.py` r3_review 8 and r3_review_compiles 7 new (memoir, the four Form documents, the
    Quick Part, each compiled in the page).
    *Verification* (a fresh verifier of 6114f5f: every high and medium of the review fixed, L2 partly,
    L7 open; and five new findings, each fixed with its case as a test): N1 a page whose items were all
    the same was not drawn again though measuring had taken its items' elements out of it (the
    wrapped paragraph's pairing, parting and empty floats measure more), so an edit round a
    wrapfigure (its caption typed in, its width changed, a first one deleted, undo) emptied the page:
    each measuring is counted and the count is in the page's signature; N2 the Form reader skips
    `\verb|…|` and `\lstinline|…|`; N3 memoir's titlingpage: the text after it on a right hand page
    in two sided documents, numbered 1 (cover, blank page, page 1, as TeX); N4 the empty float beside
    the paragraphs after a tall wrapfigure is the paragraph's `::before`, so the caret's arrows pass
    it; N5 the first words dragged out of a wrapper take the space after them. Evidence:
    `test/picture.py` r3_review 4 new (the three edits round a wrapfigure, each failing without the
    signature's count; ArrowLeft), `test/insert.py` r3_review_compiles 2 new (memoir two sided: 3
    pages in the PDF and on the page, the body numbered 1; `\verb|\end{Form}|` in a Form, compiled),
    r3_review 1 new (N5).

64. **R4, what B10 and B9 left: the thesaurus, grammar, a comments only link, the Original,
    changes by author, and the rest of References.** Done in the code (branch
    `round3-r4-review`). *Thesaurus (RV3), in C++.* MyThes 1.2.6, LibreOffice's thesaurus
    (Ubuntu's source package, pinned by SHA-256 in `tex/build_tools.sh`), is compiled into the
    spell worker's module beside Hunspell (`thes_open`, `thes_lookup`, and `spell_stem`: Hunspell's
    stems find an inflected word's entry, "Häuser" as "haus", "corriendo" as "correr", "running"
    as "running" or "run"), with the data of Ubuntu 26.10's `mythes-en-us` (WordNet's), `mythes-es`
    (ISO8859-1, converted in C++) and `mythes-de` (OpenThesaurus), each `.deb` checked against
    the release's index. The module grew 6 kB (468 kB). The data is 54 MB (gzipped 13 MB in git;
    German alone 28.7 MB, past Pages' 25 MiB a file): each `.idx` is copied as it is and each
    `.dat` cut at line ends into 52 pieces of at most 1 MiB (`split -C`), which together are the
    package's file byte for byte (the recipe checks it). MyThes reads its data with fseek and
    fgets through a device of Emscripten's file system that serves only the pieces fetched so far
    (`thesDevice`, `src/spell/worker.js`): a lookup that reads into a missing piece notes it and
    finds nothing, the worker fetches and checks that piece and asks again. The first English
    lookup fetches the index (3 MB) and one piece and takes 0.2 to 0.55 s; German "Häuser" fetched
    the index and two of 28 pieces. Shift+F7 is the Thesaurus pane (search, meanings by part of
    speech, a word pressed looked up in turn, Back, Insert), a sheet on a phone; the right click
    menu's Synonyms lists the first eight; Insert changes only the letters that differ (inside
    `\textbf{quick}` the bold stays), the old word's capitals kept, one step. Hosted build only
    (`spell/`, kept by the service worker at first use), as spelling: the artifact has no room.
    *Grammar (RV2): Harper, decided by measuring.* Two candidates on 40 sentences with one
    error each (agreement, articles, doubled words, its/it's, could of, then/than) and 312
    sentences of the corpus's English prose: link-grammar 5.12 (C, AbiWord's checker, Ubuntu's
    package) flagged 25 of 40 and 82 clean sentences (26 %), a whole sentence each with no place
    and no correction; Harper 3.2.0 (Rust, Apache-2.0) flagged 24 of 40 and 31 clean sentences
    (10 %, about half of them real slips: "of of", "state of art", "suchas"), each with its words,
    a message and a correction. No C or C++ checker was good enough, so Harper's own WebAssembly
    build is vendored: `sh tex/build_tools.sh harper` downloads npm's `harper.js` 3.2.0 pinned by
    SHA-256 and copies its slim module (20.3 MB, 8.3 MB gzipped), its JavaScript glue and license
    unchanged into `tex/vendor/harper/`; `vendor.yml` has the `harper` job. It runs in a worker of
    its own (`src/spell/grammar.js`; the module used only with the bundle's SHA-256, its glue's one
    fetch answered from those bytes), hosted build only, and only once Check Grammar as You Type is
    turned on (Spelling's arrow, the search box): starting it takes 1.3 to 1.6 s and a node process
    holding it grows to about 280 MB, which a document that never asks should not pay; Word's default is on, Rikuy's is
    off for that reason. Only prose, as spelling: `grammarBlocks` gives each block's text as one
    paragraph, a formula, a citation, a reference or code standing as "x", a footnote apart,
    another language, code and table cells left out; Harper's spelling, sentence capitals (a
    paragraph after a displayed equation starts in lower case) and long sentences are off. Blue
    double lines; the right click menu and a long press give the message, the corrections and
    Ignore Once; F7 becomes the Spelling and Grammar pane; a correction changes only the
    characters that differ, where the words are the source's own. *Comments only link (RV21).*
    Share's "Anyone with the link: Can edit and comment / Can comment only". A link has a role and
    a random name (`rid`); the version shared is kept with both. The reader's page refuses every
    edit that changes more than comment lines (`rvRefuse`, first in `App.commit`: typing, commands,
    the source, a script's `commit`). Enforced where the author's page takes the copy back: what
    it may bring is decided from the author's own versions (`linkRole`: the link the copy names,
    else the strictest link of that version; never the copy's word), and a comments only copy
    brings its comment lines alone (`commentsOf`, line by line, under the line they stand under),
    never in the preamble or inside verbatim, listings or filecontents. *Display for Review's
    Original*: the page draws the base's text (`pageFiles()` in `rebuild`) and takes no edit
    until another view is chosen; it is not kept past a session. *Changes by author.* Each step
    has an author (the AutoCorrect Options user name, Word's practice for changes; initials are
    for comments, or the coauthor whose copy came back); a layer per file of who inserted and
    deleted what (`authorEdit`) moves with every step, is kept before and after each step for
    undo and redo and stored with the base; a change two people's pieces make is cut in two
    (`byAuthor`). The Changes list names each author, each reviewer's marks have a colour of
    their own (four), Show Markup has Specific People (All Reviewers and each), Accept and
    Reject's arrows have All Changes Shown and All by each reviewer. Changes made before this
    version have no author and show as yours. *References.* Endnote number formats in the
    Footnote and Endnote dialog: enotez's `\setenotez{counter-format=…}` (written, changed in
    place, taken out) or `\theendnote` for the endnotes package; read back by hand. Insert
    Caption's Label (Figure, Table and the document's own floats), New Label (newfloat's
    `\DeclareFloatingEnvironment[fileext,listname,name]{scheme}`; float's `\newfloat` with
    `\floatname` read too; an existing figure's float renamed in the same step) and Exclude label
    from caption (caption's `\captionsetup{labelformat=nolabel}` in the float with
    `\DeclareCaptionLabelFormat{nolabel}{#2}` once: "1: …"); the page draws "Scheme 1:" and "1:".
    Insert Index's Right align page numbers: imakeidx's `options=-s index-right.ist`, a makeindex
    style of the project's own (`\dotfill` as the delimiters), drawn on the page with dots;
    off takes the option out. Table of Authorities: Mark Citation (Alt+Shift+I; Selected text,
    Word's seven categories, Short citation, Mark, Mark All) writes
    `\index[toa]{1@\textbf{Cases}!Smith v. Jones, …}` with imakeidx and
    `\makeindex[name=toa,title=Table of Authorities,columns=1]` once; Insert Table of Authorities
    writes `\printindex[toa]`; the page draws its title, the categories in bold and the
    citations; makeidx documents say why not. *Word.* An `\endnote` is a Word endnote (the note
    pandoc writes moved to `endnotes.xml` with its reference, styles, numbering format and
    relations, `src/wordnotes.js`), and Word's endnotes come back as `\endnote` with enotez and
    `\printendnotes`; `\index` entries are XE fields (TA fields for `\index[toa]`) at the end of
    their paragraph, `\printindex` an INDEX field, a Table of Authorities TOA fields, the lists of
    figures and tables TOC fields of the caption styles, all marked for Word to update as the file
    opens. pandoc reads no field, so these come back as their text only. *Security quick review*
    (outside the repository): a copy back naming a version the author never shared fell to the
    "open the copy" path and brought every edit of a comments only reader: refused now; comment
    lines inside verbatim or filecontents (a `%` line written into a file a shell escape could run)
    or in the preamble: left out; the endnotes of a stranger's Word file were rebuilt once per note
    (100,000 notes: quadratic): one pass now (0.3 s). Each with its case. *Evidence.* see the
    commit message.

64a. **R4's hostile review** (verdict: request changes, the comments only link did not hold).
    A comment line ends at any line end TeX or an engine reads: a copy holding a lone carriage
    return (or NEL, U+2028, U+2029) brings nothing. A copy back for comments only brings comment
    lines into `.tex` and `.ltx` files alone, only where the model of the version shared reads body
    text (paragraphs, headings, lists, displays, floats, tables, out of any brace group, and the
    white space beside them: `bodyAt`, `commentsBack` in `src/share.js`); every other file stays
    byte for byte, a file they add is not taken; where a file of the project changes what `%` is
    (`\catcode`, `\makeother`, `\dospecials`, expl3's catcode tables) none at all, and the code
    environments (tcblisting, VerbatimOut, luacode*, pycode and their like) are refused by name. A
    link from someone else under the name of a project this browser keeps opens beside it as
    "Name (from By)", never over it. Where two people's edits touch, each deletion keeps the words
    it took, so a change is cut by whose words it holds, a deleted word beside a typed one each with
    its space: Reject All by one person undoes theirs alone. A Word endnote holding a table or a
    list stays a footnote with every block and the import says so. Lows: the Thesaurus pane's Back
    and search field are 44 px on phones; a `|` in Mark Entry and Mark Citation is `\textbar{}`
    (hyperref reads a quoted one as a format); SOURCES.md names Harper's source tag and commit and
    says its module is upstream's build pinned by hash. Each repro is a test (`test/share.py
    attacks`, compiled in the page: the injected words are not in the PDF; `test/review.test.mjs`,
    `test/word.test.mjs`, `spell.py`, `refs.py`). Its verification left four: any project TeX file
    naming catcode, cctab, makeother, @sanitize, dospecials or ^^ in any syntax refuses comment
    lines; a link naming no sender (`#tex=`, a `#share=` built by hand) opens beside a kept project
    of its name as "Name (from a link)" too (llms.txt says so); `bodyAt` skips `\verb` to its
    delimiter and reads `\url` and `\href` addresses whole, so a `%20` keeps the count; a file the
    document lists as it stands (`\lstinputlisting` and its like) takes no comment line.

65. **R5: what Find (task 43) and the views and File (task 50) left.** Done in the code (branch
    `round3-r5-view`). *A heading's text collapsed on the page* (Word's triangle): Collapse heading
    and Expand heading (Alt+Shift+- and Alt+Shift++, Mac Control+Shift; a heading's right click
    menu, so a long press on a phone), Expand all headings and Collapse all headings (the page then
    shows its top level alone). `App.layoutPass` hands the page's items to `foldFilter`
    (`src/cmd/find.js`) before they are measured: those under a collapsed heading, up to its next
    heading of its level or above (or the bibliography's and the index's), leave the page's layout
    and nothing else: no edit, no step of history, the PDF as before (with `dist/tex` a compile with
    a section collapsed still prints its text). The state is the browser's (`localStorage`
    `rikuy.fold.v1`, under the document's name and main file, fifty documents): each heading by
    file, place, level and words; the places move with every edit (the difference from the text
    last seen, as Find's), the words find a heading again otherwise. The triangle is a button over
    the page, never in it ("Collapse: <words>", "Expand: <words>", `aria-expanded`): with a mouse
    beside the heading under the pointer, on a touch screen beside the heading the caret is in, 44
    px, after the heading's last line where the margin is off the screen; always beside a collapsed
    one. Find showing a hit under a collapsed heading opens it, and so does a caret a rebuild puts
    back there (an Undo of an edit made under it). *^p on the page's text:* the page's paragraphs
    as one text (`pageParaText`, footnotes apart), a paragraph mark where the source between two
    paragraphs is a blank line (`gapKind` 'soft': Replace takes it away or keeps its comment lines,
    as typing's join does) or a blank line or a heading's end with closing braces or opening
    commands round it ('hard': found, not replaced, the note says to use In LaTeX source); an
    `\item`, an environment or a formula between is no mark. ^p in Replace with writes a blank line
    where the place is a paragraph's own text outside any group, argument or formula
    (`breakFits`), never in a heading, a cell, a caption or a LaTeX paragraph. Special lists
    Paragraph mark. *LaTeX's kinds in Format* (Word's Format › Style): Any heading, List item,
    Table cell, Theorem or proof, Quotation, and Equation, alone: each formula (inline and
    displayed) with nothing typed, or the words in its LaTeX, replaced as LaTeX, one undo, the
    formula marked whole on the page. *V8 the rulers* (View › Show › Ruler, `src/ui/ruler.js`):
    the horizontal one stays over the pages as they scroll, the vertical one beside the page;
    the margins grey as TeX sets them (two sided documents' even pages, two columns' gaps), the
    caret's paragraph's First Line, Hanging and Left Indent and Right Indent, and the stop of a
    leader (`\dotfill`, `\hrulefill`, `\hfill`: LaTeX's fill always reaches the right indent, so it
    is shown and explained, not moved). A marker dragged (a quarter centimetre a step, Alt free,
    Escape puts it back, the value in a tip and a guide over the page) or moved with the arrows
    (it is a slider by name) writes B2's edits through `App.paraDialogApply`: `adjustwidth` for
    the indents, `\noindent`, `\hangindent` or LaTeX's own `\parindent` for the first line (Word's
    mapping: the first line left of the others is a hanging indent from a smaller left indent);
    the margins B6's `marginEdits` through `App.pageEdit`. Off where they cannot apply (a heading,
    a list item, a cell: the title says why; the margins where Layout's Margins is off). Hidden on a
    touch screen or under 640 px (the button off, saying Layout's fields do the same), in Web
    Layout, Focus and the LaTeX and PDF views. Word's tab stops at any place have no LaTeX of their
    own outside `tabbing`, which the page does not draw: the ruler adds none. *V3 Web Layout* (View
    › Views, beside Print Layout): `viewGeometry` gives `App.layoutPass` a sheet as wide as the
    window at the zoom, a quarter inch of margin, one column, no foot: the lines reflow with the
    window (the one view whose line breaks are not TeX's; the PDF is), headers, footers and page
    numbers hidden, a page break a dashed line; on a phone the text at its actual size; Draft,
    Print Layout, One page and pages across take it off; kept with the preferences. *F4 Recent
    documents › Rename a document…* (the open one too): every version, the pictures, where it came
    from and the live figures' permission (`bin:`, `link:`, `share:`, `scripts:` records) and its
    collapsed headings go under the new name (`snapRename` in `src/store.js`, one transaction);
    the open one's record and the bar too; a taken or an empty name is refused, a `|` (the records'
    separator) becomes a space. *Security quick review* (notes outside the repository): two
    findings fixed with tests, a ^p replacement across a break holding a review comment deleted
    the comment, and a renamed name with `|` could alias another document's records; the scans on
    a stranger's text are bounded (`gapKind` 400 characters, `breakFits` 40 000, fold lookahead
    64, entries validated and capped at 2000). *Evidence:* `npm test` green (`find` 28 groups: ^p
    on the page, the gaps, 2000 hostile gaps under 500 ms, folding and finding it again);
    `find.py` 102 (76), `outline.py` 98 (59) with `dist/tex`, `view.py` 151 (108), `file.py` 98 (87) with `dist/tex` and `dist/word`,
    `browser.py` 193, `agent.py` 143, `tabs.py` 115, `ribbon.py` 195, `para.py` 204, `page.py` 144 (its speed check on every command). Screenshots in
    `/tmp/R5-shots` and `/tmp/B12-shots` (collapse, rulers light and dark, Web Layout at 1366, 390
    and 360 px, Rename). Not done: the page's table of contents leaves the page numbers of
    collapsed headings blank while they are collapsed (the PDF's are TeX's).
    *After the hostile review of 411a0a7* (3 High, 5 Medium, 6 Low; each with the reviewer's case
    as a test, compiled in the page): ^p replaced by nothing after a control word writes `{}`
    (`\dots{}Next`, not `\dotsNext`; any deletion of a hit now keeps a control word apart from the
    letters after it) (H1); `breakFits` counts an optional argument open at the place, so no
    paragraph break goes into `\item[..]` or a theorem's `[..]` (H2); Format › Equation takes the
    query and the replacement as LaTeX (x^p, M^t; only ^& and the groups are codes) and finds no
    hit inside a control word (`a` never in `\alpha` or `\frac`; `\alpha` asked for is found) (H3).
    The ruler moves the outer margin on an even page of any two sided document (M1); a slider keeps
    the focus, two presses two steps (M2); First Line goes by the keys from one of LaTeX's states
    to the next, and Hanging never moves the first line (a place LaTeX cannot give is refused with
    a note) (M3). Rename is one IndexedDB transaction over the versions and the records, the new
    name checked free inside it: all or nothing, two renames to one name at once refused (M4).
    Go To, the Navigation pane and any caret sent to a place (`restoreCaret`, `goTo`: comments and
    changes too) open the collapsed heading that hides it (M5). A collapsed section moved past
    another stays collapsed (found by its words first, L3); Remove forgets its collapsed headings
    (L2); on a phone a wrapped heading's triangle covers no word of the line above (L4). Left as
    they are: a break inside `{\bfseries ..}` is not offered as a mark (L1, found by none); a
    selection across a collapsed heading deletes the hidden text too, as Word's does, one Undo
    back (L5, said in llms-full.txt); the ruler's markers are Word's size, for a mouse (L6).
    Evidence after merging main 4f0f489 (R1): `npm test` green (`find` 28 groups), `find.py` 115,
    `outline.py` 105 and `view.py` 160 with `dist/tex`, `file.py` 100 with `dist/tex` and
    `dist/word`, `tabs.py` 115.

66. **Word's keyboard shortcuts** (branch word-shortcuts, draft PR 80). Every shortcut on
    Microsoft's Keyboard shortcuts in Word page, Windows and macOS, and the equation keys,
    against Rikuy's registry: `docs/handoff/SHORTCUTS.md`, one table, each row works, added,
    kept by the browser (with what to press instead) or without an equivalent in a LaTeX document
    and why. Added: Ctrl+1, 2, 5 (line spacing), Alt+Shift+> and < (footnotes), F5 (Go To),
    Shift+F4 and Ctrl+Alt+Y (Find Next), Shift+F5 and Ctrl+Alt+Z (Go Back), F8 and Shift+F8
    (Extend and Shrink Selection), Alt+Shift+A and Alt+Shift+1 to 9 (outline levels),
    Ctrl+Alt+P, Ctrl+Alt+N, Alt+F9, Ctrl+F2, Shift+F1, F1, Ctrl+F6 and Ctrl+Shift+F6 (panes),
    Alt+X, the accent keys (Ctrl+' then e is é, and the rest), ¿ and ¡, Ctrl+F3 and
    Ctrl+Shift+F3 (the Spike), F2 and Shift+F2 (move and copy, then Enter), Alt+F3, Ctrl+F9,
    Alt+Shift+P, Ctrl+Shift+P, Alt+Shift+O, Ctrl+Shift+F5, Alt+F7, the number pad's dashes,
    Alt+Home, End, Page Up, Page Down and Alt+Shift+Up and Down in a table, Alt and the pad's 5,
    Shift+F12, Alt+Shift+F2, Ctrl+F12, Ctrl+Alt+F2, Ctrl+Shift+F12; Hanging Indent as a command
    (Word's Ctrl+T is the browser's). Word for Mac's own chords (Cmd+Option+L, R, A, E,
    Cmd+Control+V, Control+Space, Control+Shift+M, Cmd+8, Cmd+G). Tooltips, menus, the search
    box and Help write a Mac's chords with ⌘ ⌥ ⌃ ⇧; Help ends with Word's keys the browser keeps.
    Function keys reach their commands from fields and the source, Ctrl+Alt chords from the
    source. Save, as Word's keys mean it: Ctrl+S (and Shift+F12, Alt+Shift+F2, the bar's Save)
    writes the project to this browser now and says "Saved in this browser", downloading nothing
    (it downloaded a file at every press); Save As (F12 on the page) and Download LaTeX download.
    The hostile review (`/tmp/review-keys.md`, changes requested) is answered in the commits named
    after it: Move Row keeps each row's cells (H1), F2's wait ends at a click, a key or an edit
    (H2), the Spike keeps a heading whole (M1), no Option and character key is taken on a Mac
    (M2), a French keyboard's Ctrl+1 is Ctrl+1 (M3), Hanging Indent round trips (M4), Alt+X reads
    LaTeX's accents (M5), and the lows. Evidence: `npm test` green (`keys` 19 groups, `typing` 6, `commands` 13 with the
    `WORD` table on both systems, `table` 47), `test/shortcuts.py` 82 checks (screenshots in `/tmp/keys-shots`).

66a. **The ribbon's other tabs laid out as Word's.** Done in the code (branch `ribbon-tabs-word`).
    Home was done in PR 75; `src/ribbon/layout.js` now says, for Insert, Design, Layout,
    References, Review, View, Help and the contextual tabs (Table Design, Table Layout, Picture
    Format, Equation, Header & Footer), each group's commands in Word's order with Word's size:
    large (the icon over the name, broken over two lines as Word breaks it, a menu's arrow after
    it), small with the name (three to a column), the icon alone, or a gallery's tile (Table
    Design's five looks). From 900 px a laid out group is a grid of three rows with its name on a
    row of its own under it, so the group is never narrower than its name; narrower, the row is as
    it was. Word's check boxes for Table Style Options, View's Show and the header's Options (the
    controls stay toggle buttons with their state). Every tab is as tall as Home (92 px), so the
    page no longer jumps when another tab opens; Home's Clipboard and Styles names now sit on the
    same line as its other groups'. Where the row is short a group gives way as Word's do, one
    step at a time, the least needed group first and none of it costing a control: its large
    buttons small (only where that is narrower), then its names; only then does any group fold
    (`ribbonFit`). Group names as Word's (Page Setup, Citations & Bibliography, Rows & Columns,
    Cell Size, Table Style Options...; Table of contents stays in small letters, its folded
    button must not share its button's name); View's groups as Word's (Views, Immersive, Page
    Movement, then Rikuy's Dark Mode, Show, Zoom). Corner arrows on Layout's Paragraph,
    References' Footnotes, Table Layout's Cell Size and Picture Format's Size. KeyTips for every
    control of every tab, Home's included: Alt, the tab's letter, then the control's (Word's
    letters where Word has them: Alt, N, T is Table, Alt, R, C New Comment), drawn over the
    ribbon, never in a button's name; a folded group is Z and a letter; Escape goes back a level.
    Layout's Paragraph group no longer took Home's Paragraph rules (its fields were cut off at
    224 px), and the open tab's name reads on a dark ribbon. No command, name or role changed.
    Evidence: `npm test` green (commands: 14 groups, the layout's ids and the KeyTips unique and
    prefix free per tab), `tabs.py` 115 and `word_layout` 12, `agent.py` 143, `ribbon.py` 195,
    `font.py` 309, `para.py` 254, `lists.py` 218, `picture.py` 228, `insert.py` 224,
    `styles.py` 426, `view.py` 163; screenshots of every tab at 1920 and 1366 px, light and dark,
    and 390 px.
    The hostile review (fix first) and what changed for it: Word's grid is for a mouse alone,
    `(min-width: 900px) and (pointer: fine)` in the style sheet and `wideLay()`, so a tablet in
    landscape keeps its row of 44 px targets (H1; `tabs.py tablet`). The steps that shrink a group
    are two chains given back from their ends, so ranks hold and a wider window never shows fewer
    names; on a laid out tab the three downloads become one Download button before the names of
    rank 4 and up go (M1; the sweep checks names too). A run of Word's small buttons stays in one
    column when a group shrinks, Previous over Next (M2). The contextual tabs' KeyTips JT, JL, JP,
    JE, JH (M3). Insert Table, Convert Text to Table and Table from Data File are items of Table's
    menu, no buttons beside it; Page setup dialog, Footnote and Endnote and Size and Position are
    their groups' corner arrows with a mouse from 900 px, the buttons they were elsewhere (M4).
    Large split buttons as Word's, icon above, name and arrow below (L1); every shown name in its
    accessible name (L2); keys the KeyTips take stop there (L4); on a Mac F10 alone (L5); arrows
    move across the grid (L6); 67 px for every tab from 861 to 899 px (L7); a pressed toggle in the
    highlight with forced colours (L8). Download PDF keeps its name and width while busy (the UX
    audit). Names agents see that changed (L3): the group names in Title Case as Word's (Page
    Setup, Document Formatting, Page Background, Document Setup, Citations & Bibliography, Table of
    Authorities, Table Style Options, Table Styles, Rows & Columns, Cell Size), which a folded
    group's button and `controls.json`'s groupName carry; View's group "Page" is gone, its Side to
    Side, Dark page and Focus now in Page Movement, Dark Mode and Immersive; the three table
    commands above are no ribbon controls in `controls.json` any more. No command's own name or
    role changed. Evidence: `npm test` green, `tabs.py` 137 (word_layout 17, tablet 3,
    mac_keytips 1), `agent.py` 143, `ribbon.py` 194 and its downloads 8.
67. **The security review's open items (S2 to S5 of `docs/reviews/SECURITY.md`).** Done in the
    code (branch `sec-followups`), one commit each. *S4:* the hosted copy sends
    `Strict-Transport-Security: max-age=31536000` on every file, for its own host only (no
    `includeSubDomains`, no preload: those would bind rackebrandt.pe's other names for a year);
    `test/deploy_check.py` checks it (53 checks). *S3:* the hosted page's `script-src` is `'self'`,
    the SHA-256 of its one inline script (the app's bundle; the build takes it from `index.html`),
    `'wasm-unsafe-eval'` and `blob:` (Pyodide's runtime): no `'unsafe-inline'`, no `'unsafe-eval'`.
    Nothing in the page or its workers needs eval (`build/app.mjs` `policy` lists what was
    checked). Live figures run in a document of their own, `widget-<hash>.html`, with the
    widgets' policy (a srcdoc frame takes the page's), from the HTTP cache when offline; the
    claude.ai copy keeps srcdoc. The browser tests that open the page through `serve.py` or
    `open_page` now run under the hosted policy, read from `dist/_headers` (`browser.py` hands
    Playwright's polled expressions over as functions, which it would otherwise eval in the page).
    New `test/csp.py`: a whole session with every refusal reported to the server, none (21
    checks, in `tex.yml`). Safari 15 cannot compile on the hosted copy (no `'wasm-unsafe-eval'`).
    Running the tests under the real policy showed that `connect-src 'self' blob:` had refused
    every git push, pull and clone on the hosted copy (the Git panel went through a third party's
    CORS proxy). Git now goes through Rikuy's own proxy on the same site, `/git`, a Cloudflare
    Pages Function (`functions/git/[[path]].js`, `src/gitproxy.js`): git's smart HTTP alone, to
    public https hosts by name, the token to that host alone, 32 MiB at most; `connect-src`
    stays `'self' blob:` (docs/HOSTING.md: what it lets through, what it costs).
    `test/gitproxy.test.mjs` (9 groups) checks what it lets through; `git.py` runs it locally
    (`test/gitproxy_server.mjs`): under the policy as it ships, a clone through `/git` works, one
    straight to a host is refused with a message naming `/git`, and `/git` refuses an IP address.
    *After the hostile review (`/tmp/review-sec.md`):* M1, the widget shell writes only for a
    parent of its own origin and only in the sandbox, and `runWidget` sets the sandbox itself
    (`widgets.py`); M2, Edit Comment writes a base32 comment line again whole (`review.py` 108);
    L1, the shell is asked for at its address without `.html` (Pages redirects `x.html`, which the
    service worker's install would refuse; `pages.py` now does as Pages does, `offline.py` 61),
    and a shell that never loads leaves the figure's picture and a note (`widgets.py` 66); L3,
    `no-transform` on the page and `dev/live_check.py` after each deployment; L2, where a browser
    refuses WebAssembly (Safari 15) the PDF pane says so plainly (`csp.py` 22); and `frame-src
    'self'` (the hosted page frames only its widget document), control and direction marks taken
    out of comment names and texts, and a line that only looks like a comment counted as text.
    *After the verification of 8212363:* the git proxy answers Rikuy's git client alone (the
    header `X-Rikuy-Git`, which another site's page cannot send without a refused preflight; no
    navigation, nothing but a script's fetch, nothing from another site), only to known git
    hosts (nine, and `RIKUY_GIT_HOSTS`), every answer git's own type or bytes, sandboxed, an
    attachment, readable by this site alone, capped at 5 minutes and, where the host gives a
    length, 256 MiB (no script on the stream: review L6), without the host's
    `WWW-Authenticate`; the installed app's service worker refuses a navigation to `/git`;
    HOSTING.md step 9 has the rate limiting rule (`gitproxy.test.mjs` 12 groups, `git.py` 49,
    `offline.py` 62). `para.py`, `picture.py`, `refs.py` and
    `styles.py` serve the policy too.
    Under the new policy: `browser.py` 199, `agent.py` 143, `offline.py` 60, `launch.py` 18,
    `engines.py` 44, `word.py` 111, `spell.py` 124, `widgets.py` 62, `insert.py` 224,
    `mathfield.py` 19, `pdf.py` 23, `deploy_check.py` 61. *S2:* KaTeX 0.16.22 to 0.19.1 (its
    page script, mhchem, style sheet and fonts; the pinned hashes, `package-lock.json`). New
    `dev/katex_compare.mjs` draws every formula of the model of the documents given with two
    KaTeX builds and sorts the differences: on the sample and the 716 corpus documents (16,193
    formulas) no new error (one fewer, `\mapsfrom`), 11,785 drawn the same (0.18 prefixed its
    inner classes with `katex-`, which Rikuy's styles never name, and writes lengths to four
    decimals), 283 aligned blocks 0.15em shorter above their first row and below their last
    (rows as far apart as before), 189 negated relations with an empty span keeping them on one
    line, and 207 others: letters set one by one with their own italic correction,
    `\underbrace` and `\overbrace` spaced as inner atoms, `\not` drawn another way. *S5:* a
    comment line a comments only copy brings in is written `% comment32 <name> <words> <text>`
    (`% reply32 <name> <text>`), each part in base32, whatever form it came in (`commentsOf`
    matches lines by what they say); the reader's page writes that form already, the page shows
    it as typed, lines in the first form stay and are read as before. After its % such a line
    holds letters, digits and spaces alone, so it runs nothing where a document made % ordinary
    by a `\csname` built `\catcode`, `\scantokens` or Lua, which the static filter cannot see:
    `share.py catcodes` compiles each in the page, the reader's line as written prints its
    marker and the same line through the link does not (10 checks; `share.py` 83 in all, its
    Open in Overleaf check now reads the form the page makes, which the hosted policy's
    `form-action 'self'` refuses to post, as `pdf.py` says to the user); `review.test.mjs` and
    `share.test.mjs` (base32 against RFC 4648's vectors, the forms read and refused).

68. **A power user's keys** (branch power-keys, draft PR 87; `docs/handoff/POWER-USER.md`).
    The owner's daily work done keys only and timed against Word, Overleaf and VS Code; the 18
    findings ranked by cost, and the first fourteen fixed: a footnote left by Esc, Shift+F5, Right
    and Ctrl+End; `$x^2$` and LaTeX typed into the equation field as in the source (braces,
    `\mathbb`, `\text`, `\left(`, `\begin` carried on in the LaTeX box); Tab kept on the page
    (first line indent, a gap; Esc then Tab leaves); the reference and citation pickers by the keys
    with what each label names; Go to Label (F12, Ctrl+click) and back; Enter and F2 on a selected
    formula; Ctrl+Shift+= in a new equation; Esc out of Read Mode; KeyTips for Home's Insert group
    and Table's grid; Alt+Q by letters in order, initials and Recently used; the `\` list's valid
    LaTeX (figure, align, gather, cases, theorems with their `\newtheorem`, Enter twice out of a
    theorem); F4 repeating typing; Go to File on Ctrl+P (Print its first line); keys typed while
    the page builds going in together (on dev/bench/long the page done 81 ms after a fast
    typist's last key, 1605 ms before; at a phone's speed 306 ms, 2315 before). `test/power.py`
    79 checks (54 fail on the build before), in CI. Open: findings 11, 12, 15 (PR 79's areas).

## Open tasks

67. **Word's ribbon buttons Rikuy has no command for** (task 66 left them out). Insert: 3D
    Models, Online Videos, Get Add-ins, WordArt, Signature Line, Object, and Date & Time (the
    command `insert-date` exists, without an icon or a place on the ribbon). Draw: the whole tab.
    Design: Effects, Set as Default (File has `set-default`). Insert › Tables: Draw Table, Excel
    Spreadsheet, Quick Tables in Table's menu. Layout › Arrange: Bring Forward, Send
    Backward, Selection Pane, Align, Group. References: Update Table (contents, figures,
    authorities), Update Index, Research (Search, Researcher). Mailings: the whole tab. Review:
    Translate, Protect (Block Authors, Restrict Editing), Hide Ink, the Tracking group's corner
    arrow (Track Changes Options). View: Immersive Reader, Vertical (Side to Side's other half),
    Gridlines, the Zoom dialog, the Window group, Macros. Table Design: Border Styles, Pen Style,
    Border Painter, the Borders corner arrow (Borders and Shading). Table Layout: View Gridlines,
    Draw Table, Eraser, Formula, the Rows & Columns corner arrow. Picture Format: Remove Background,
    Corrections, Color, Artistic Effects, Transparency, Compress Pictures, Picture Effects, Picture
    Layout, the Picture Styles gallery and its corner arrow, Bring Forward, Send Backward, Selection
    Pane, Align, Group. Equation: Ink Equation, Unicode or LaTeX and Convert, Normal Text, the
    Tools corner arrow (Equation Options). Header & Footer: Quick Parts and Pictures in its Insert
    group, the Navigation group, Show Document Text, Header from Top and Footer from Bottom as
    fields. Contextual tabs Word has and Rikuy has not: Shape Format, Chart Design and Format,
    SmartArt Design and Format.

16. **The arXiv corpus** (task 3's finish line): compile rate and match rate on the 1,000
    papers, every failure classified as in task 2. Needs arxiv.org (see task 3). The owner runs
    it once the repository is public, where Actions minutes are free; `arxiv.yml` is ready
    (task 24 hardened it).
    First run, 43936586314 (2026-11-16; its merge redone by run 43980636663 once
    `arxiv_collect.py` read corpus_full.py's row names): 998 papers, Rikuy compiled 932 (93.4 %),
    the desktop 964; of the desktop's 964 Rikuy compiled 932 (96.7 %); 623 of the 932 both
    compiled matched (66.8 %). Median compile 2.3 s in the page, 90th percentile 7.5 s.
    - 183 mismatches print [?] where the desktop prints numbers: the paper ships its .bbl and
      not the .bib, and Rikuy ran bibtex anyway, whose failed run wrote an empty .bbl over it.
      latexmk does not run bibtex when a .bib is missing. Fixed: `tex/engine.js` keeps a project's
      own .bbl when a .bib the .aux names is in neither the project nor the tree.
    - 32 papers fail in Rikuy alone: about 22 packages and fonts missing from the tree (newtxtt 5,
      bbding 3, kotex, fdsymbol, feynmf, feynmp 2 each, then one each), and 2 biblatex papers whose
      shipped .bbl this biblatex cannot read (100 errors at the first pass; latexmk -f goes on to
      biber). The second is fixed: the .bbl is dropped after that pass and biber writes it again.
    - The missing packages, in the tree now: newtxtt, bbding, fdsymbol (Type 1), dutchcal,
      boondox (mathalpha's `bb=boondox`), urwchancal, phonetic, pbsi (brushscr), ascii, ascmac
      (from `texlive-lang-japanese`), the LY1 encoding (fbb's), feynmf.sty and feynmp.sty
      (Ubuntu's `feynmf`, newly pinned: 55 packages) in the packs the artifact carries (0.8 MB);
      ifsym's and bbding's PK fonts from 7 to 12 pt (an ifsym symbol in a superscript asked for
      ifsym10 at 420 dpi) and phonetic's from 10 to 12 pt (`build_pk.py`, 0.6 MB); Libertinus,
      Droid, fbb, frcursive, Baskervald, fdsymbol's OpenType fonts and utfsym (out of `DROP`) in
      hosted only packs (`LARGE_PICKS`, 15 MB), and ko.TeX with Nanum's Type 1 fonts and UHC's
      Myeongjo beside the other scripts' (16.7 MB); 70 such packs, 109.9 MB. The worker lets a
      document naming one of them read those packs as it does for scripts (`SCRIPTS_RE`), so the
      artifact says where the hosted Rikuy is instead of "libertinus.sty not found". The
      fontconfig and luaotfload caches were made again (187 caches; the 165 old ones unchanged).
      Each package compiled in the page with a minimal paper (pdfLaTeX; Libertinus also by name
      with XeLaTeX and with LuaLaTeX, ko.TeX also with XeLaTeX), no file missing and the
      package's fonts in `pdffonts`. METAFONT and MetaPost do not run here: feynmf's and
      feynmp's diagrams are missing and the paper compiles (a desktop makes feynmf's with
      mktextfm). Artifact 254.1 → 255.7 MB.
    - 30 fail on both: journal classes arXiv supplies beyond TeX Live (aa, svjour3, mn2e, jheppub,
      iopart, PoS, aastex, svmult), files missing from the source, errors under TeX Live 2026.
    - 4 ran past the 240 s limit; corpus_full.py now records the worker's last steps for such a
      row, and pdfcompare.py the fonts on one side only for a mismatch (the run keeps no PDFs).

    Second run, 44077385415 (2026-11-17, main cb4d5a8: the .bbl rule above and the packages):
    998 papers, Rikuy compiled 960 (96.2 %), the desktop 962; of the desktop's 962 Rikuy compiled
    960 (99.8 %); 872 of the 960 both compiled matched (90.8 %). Median compile 2.3 s, 90th
    percentile 8.0 s. What is left, classified:
    - 2 fail in Rikuy alone: `sourcesanspro.sty` and `foekfont.sty`, not in the tree yet (the
      fbb and brushscr papers load them too).
    - 31 fail on both, as in the first run (classes arXiv supplies beyond TeX Live, files missing
      from the source, errors under TeX Live 2026); 5 ran past 240 s, their trails showing TeX run
      again and again through shell escape (figures made by TeX) or a long biber run.
    - About 43 of the 88 mismatches are the bibliography's: 31 papers ship a .bib lacking entries
      their .bbl has, so Rikuy's bibtex run printed [?] where latexmk, which keeps a .bbl it finds
      on a first run, printed numbers; 6 more print accents as combining characters pdfLaTeX
      cannot set (bibtex rebuilt the .bbl from such a .bib), and several superscript or author
      year citations print ? the same way. Fixed now: of the project's own .bbl and the one bibtex
      or biber makes, the worker keeps the one that resolves more of the citations, the own one
      on a tie in a project's first run (biber's only when its format version is the own one's);
      and once bibtex's .bbl is taken, later runs no longer write the project's file over it (a
      citation added after bibtex ran had gone back to [?] on the next run).
    - 9 are the desktop's: it printed an older biblatex's .bbl as text ("author2hash=...") or
      [?] where Rikuy, with biber's .bbl, printed the references.
    - About 15 break lines at other places (pixels within 1 to 9 %; "cano-nique" against
      "canon-ique", "Arbit-rum" against "Arbi-trum"); 4 differ in pixels only (text equal);
      1502.01027 prints the hook name "begindocument/b..." on its first page; 2202.05036 lacks
      cbfonts' `grmn` (the archaic koppa); the rest follow from a float or a page placed
      elsewhere. Not classified further without the PDFs (the workflow keeps none).

    Third run, 44728716263 (2026-11-20, main 4063ad1, to measure the .bbl fix): stopped in its
    first minutes, arXiv's listing answering 429 while the sample was drawn; nothing compiled.
    Now `get` waits as arXiv asks and tries again, and `sources_from_run` compiles an earlier
    run's sample again (its sources from that run's cache, or fetched again where gone), so a
    third run measures the fix on the second run's 998 papers.
66. **Everything that computes, in C or C++ for WebAssembly.** Planned, not started: asked for by
    the owner on 2026-11-20 ("even where the gain is small", after the UI and UX work).
    `docs/handoff/CPP-PLAN.md` has the inventory of `src/` and `tex/` by module, the batches B0 to
    B11 in order (each with its files, C++ layout, oracle, benchmark, size and risks), the size
    budget (the artifact has about 300 KB left) and what stays JavaScript. Measured while planning
    (node, one core of a busy machine): a full model build of `dev/bench/long` is 47 to 67 ms,
    three times task 52's 16 ms, because B4 and round 3 added preamble readers that each strip
    the comments of the whole file again (more than half of a full build; 2/3 of a keystroke in
    its `\title`, 97 ms); memoizing them in a scratch copy made it 19 ms and 30 ms. Every full build
    also parses every .bib again (46 ms for a 2 MB one). B0, in JavaScript, fixes both first.
    *B0 done* (branch `cpp-plan`): `src/scan.js` reads a text's comments and the preamble's end
    once per text for preamble.js, looks.js and styles.js (each keeps its cap, so every answer is
    the one before); the model keeps each .bib's entries with the text they came from; the undo
    record compares from where the edits were. `dev/bench_native.mjs -n 9` (one core of the busy
    machine, two runs each, with the core): the paper's keystroke model 44.1 and 26.1 ms before,
    14.7 and 15.2 ms after; its first load 40.0 and 41.0 ms before, 35.5 and 29.7 after; a
    keystroke in its `\title` 82 to 95 ms before, 29 to 30 after; with a 2 MB .bib 83 and 87 ms
    before, 36 and 25 after; the undo record's diff 0.5 to 0.05 ms. Evidence: `test/scan.test.mjs`
    (new, 5), `model.test.mjs`'s .bib check and `edge.test.mjs`'s undo check (7677 of 7677 steps),
    each failing on a planted bug; `npm test` green (view.test.mjs V4's 50 ms timing failed once on
    the busy machine and passed alone); `INCR_FULL=1 incremental.test.mjs` every one of 8000
    edits equal, its fast path share check failing on main (4063ad1) the same way (334 of 7600,
    the floor 380); `page.py long_document` 6 of 6 (11 ms for every command at a look at the
    caret); `browser.py` 199 of 199. No LaTeX-examples clone on this machine: the corpus runs not
    run. *B0's hostile review* (no go until F1): F1, an open undo step kept the untouched region of
    a file that was opened over it between two keystrokes, and Ctrl+Z wrote a text that never was:
    openFiles closes the step, and the step checks itself (`stepStart`, `stepJoin` in
    src/editor.js: a file found changed between its commits is compared from the ends); F2, the
    .bib cache let a closed project's entries go never (38 MB for 8 projects): it keeps what the
    last build asked for (6 MB); F3, the kept entries are frozen; and preamble.js's
    `stripComments` no longer says a stretch twice past 400,000 characters (a bug from before
    B0). The long incremental run's fast path share check, failing on main too, was the streams'
    luck, not a regression (every paragraph of every repository document takes the fast path as
    often as with f5bb84d's sources): its floor is now 1 in 40, and an exact check per paragraph
    guards the fast path. Evidence: the reviewer's repro "consistent" (with and without the
    step's closing); edge.test.mjs 10691 of 10691 with 1145 outside changes (524 differ without
    the check); model.test.mjs's .bib checks; scan.test.mjs 8; incremental 35 of 35 and with
    `INCR_FULL=1` 35 of 35; `npm test` green but V4 (flaky, 2 of 3 alone); `history.py` 40 of 40,
    `browser.py` 199 of 199, `page.py long_document` 6 of 6.
## Rules

- No status commits ("Note ...", "Record ...") and no log in this file. One commit per
  finished task, its message saying what changed and the evidence (test counts, corpus count).
  Two exceptions, so another agent can carry on work someone stopped (AGENTS.md, Handing off):
  `HANDOFF.md`, rewritten whenever the work in flight changes, and "WIP: done X; left Y"
  commits on a branch that is not merged yet.
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
