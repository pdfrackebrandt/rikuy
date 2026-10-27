# Galley: state and plan

Rewritten 2026-10-25 after round 2, which finished or measured every task of the round 1 plan
(`git show 2287de8:PLAN.md`). Read the rules at the end before the first commit.

## Where it stands

| check | v19 (published 2026-10-12) | version 22 (published 2026-10-25) |
|---|---|---|
| corpus compiles (LaTeX-examples, 716 documents present) | 705 | 706 |
| corpus PDFs equal to a desktop TeX Live 2026's | 615 of 704 (87.4 %) | 700 of 705 (99.3 %) |
| TeX passes over the whole corpus | not counted | 995 (1,471 without latexmk's first-run `.aux`) |
| `test/engines.py` | 22/22 | 22/22 (its PSTricks check now asks for drawn lines) |
| `tex/native/xindy/test.cjs` (against CLISP's xindy) | 11/11 | 11/11 |
| TeX Live's 220 Asymptote examples as a native asy 3.09 draws them | not measured | 216 (196 equal PDFs, 12 equal failures, 7 random by design, 1 equal alone); 4 open |
| artifact size (limit 256 MB) | 250.0 MB | 249.7 MB |

Equal means: the same number of pages, the same text on each page (`pdftotext -layout`,
whitespace collapsed), and no page with more than 0.1 % of its pixels differing by more than
64 of 255 at 72 dpi in grey. Both sides run with `SOURCE_DATE_EPOCH=1700000000` and
`FORCE_SOURCE_DATE=1`. The desktop is Ubuntu 26.10's TeX Live 2026.20260711 with the fonts its
packages recommend (`dev/fetch_tl26.sh`, `dev/tl26.sh`), run through latexmk with rules for what
Galley's worker runs between passes (`dev/pdfcompare.py`). Results: `dev/corpus-results.jsonl`
and `dev/pdfcompare-results.jsonl`.

### What round 2 changed

- **The tree is TeX Live 2026.20260711.** Ubuntu 26.10's TeX Live packages (pinned by
  sha512 in `tex/fetch_inputs.sh`) are laid over the tree in BusyTeX's release (TeX Live 2026 of
  March) and win for every file they share; BusyTeX keeps its engine's configuration. The three
  formats are made by Galley's own engines from that tree (`tex/build_formats.py`). The LaTeX
  kernel is 2026-06-01 (v19: 2025-11-01). `GALLEY_TL_FIRST=0` builds v19's tree.
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
    documents). `engines.py` passed because it only asked for no errors. The engines now run
    with TeX Live's `-progname` (pdflatex, xelatex, lualatex, latex), and the test asks for
    drawing operators on the page: 0 on the old worker, now there.
  - pgfplots' gnuplot plots all write `<job>.pgf-plot.table`; a second table of the same size
    written within the millisecond the folder was copied in looked untouched and never reached
    TeX, which drew the first curve again. Copies now carry the time 0.
  - sansmathaccent was not in the tree; beamer loads it whenever it is installed, so math in
    sans slides used another italic than on a desktop.
  - A first compile ran two passes where latexmk runs one: latexmk starts from the `.aux` a
    one page document writes. Galley does too now; the corpus needs 995 TeX passes, not 1,471.
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
- **Programs built here from source** (`tex/build_tools.sh`): dvips, Asymptote 3.09 now with
  GLM and XDR (WebGL, V3D and PRC output; two fixes in `native/patch_asy.py` for GLM without
  OpenGL), xindy, and gnuplot 6.0.2. A clean `GALLEY_SRC` rebuilds all four.
- **Size:** the niche packages TeX Live 2026 added (one school's beamer theme, thesis classes,
  icon and card sets) go to the mirror only (`DROP` in `tex/build_tree.py`), as do the Aurical
  fonts.
- **Reproducible:** `tex/fetch_inputs.sh` into an empty folder, then
  `build_tree.py tree && build_tree.py packs && node build.mjs`, gives `dist/tex` byte for
  byte as `dev/dist-manifest.txt` lists it (checked 2026-10-26 for version 22: 268 files equal,
  from the committed `inputs/` in an empty work folder; the downloads there were the ones
  already fetched, which `fetch_inputs.sh` checks by hash).
- **Desktop reference fixed:** the fonts TeX Live's packages recommend (Debian moves Linux
  Libertine, Gentium, Noto and others out of the tree), the font databases, and CLISP for xindy.

## Building

1. `npm ci` (node 22); `pip install lz4 playwright numpy`; Chromium for Playwright through
   `PLAYWRIGHT_BROWSERS_PATH`; `poppler-utils` for the comparisons.
2. `tex/fetch_inputs.sh` lays out `$GALLEY_WORK` (default `/tmp/eng`): about 3 GB, rerunnable,
   every download checked against its hash.
3. `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs` gives
   `dist/`. Use this, not `build_all.sh`: the formats, PK fonts, metrics and font caches in
   `inputs/generated*.tar.gz` were made for exactly this tree. When the tree changes,
   `tex/build_all.sh` remakes them all, then pack them again (`fetch_inputs.sh` says how).
4. Programs built for Galley are committed in `tex/vendor/`; `tex/build_tools.sh` rebuilds them
   (`GALLEY_VENDOR` to build elsewhere and compare).
5. The desktop TeX Live 2026 for comparisons: `dev/fetch_tl26.sh` (into `/opt/tl26`, about
   6 GB), then `dev/tl26.sh <program>`.

Tests:
- `cd test && python3 engines.py` (and the other `*.py` there; they serve `dist/`)
- `node --no-experimental-fetch tex/native/xindy/test.cjs`
- `node test/model.test.mjs` and the other `*.test.mjs` (CI runs them)
- one document: `DIST=dist python3 dev/texrun.py DIR main.tex auto 300`; where its time goes:
  `dev/profile.py le/<path>`
- the corpus: clone MartinThoma/LaTeX-examples at `8bfd313b8d98`,
  `CORPUS_REPO=... SDE=1700000000 PDF_DIR=pdf python3 dev/corpus_full.py OUT.jsonl`. About
  100 minutes on 2 cores. Run nothing else meanwhile: the harness limit is 240 s.
- the comparison: `DESKTOP_CACHE=desk python3 dev/pdfcompare.py OUT.jsonl pdf CMP.jsonl`, then
  `dev/pdfcompare_report.py CMP.jsonl dev/pdfcompare-classes.json`
- Asymptote: `dev/build_asy_native.sh` (GLM=1), then `dev/asycompare.py OUT.jsonl FILES...`
- the editor: `test/editor_corpus.py OUT.jsonl`

## Tasks of round 1: status

0. **Parity with v19.** Done in round 2's first commit: manifest equal, 22/22, 11/11, every
   document ok in the baseline ok again.
1. **No hard coded work folder.** Done.
2. **PDFs against a desktop TeX Live 2026.** Done. 700 of the 705 documents both sides
   compiled are equal (99.3 %). Every other one has its cause in `dev/pdfcompare-classes.json`,
   and none is Galley's: three 3D Asymptote figures the desktop asy cannot render without a
   display (a blank page, or one of height 0; Galley draws them as vectors), one Metropolis deck
   whose Fira Sans the desktop's fontconfig lists but XeTeX cannot load (it falls back to
   Computer Modern serif; Galley has no Fira, says so and keeps Latin Modern Sans), and one
   document whose pixels are equal but whose opening quote has no Unicode mapping in Debian's
   own build of Linux Libertine. One document compiles in Galley only: `class-diagram` needs an
   `mpost` step from its Makefile that neither side runs, and latexmk calls the missing figure
   a failure.
3. **A larger corpus (arXiv).** Blocked: arxiv.org is not reachable from the build machine (its
   proxy refuses it, as it refuses CTAN). Ready to run: `dev/arxiv_corpus.py` (seeded sample of
   1,000 papers, 84 per year 2015 to 2026, a PDF-only paper replaced by the next of its year,
   one request per 3 s) and `.github/workflows/arxiv.yml` (sample, fetch, build, 8 shards
   compiling with Galley and with the desktop TeX Live, results committed to the branch
   `arxiv-results`). Two ways to unblock, the owner's choice: allow `arxiv.org` and
   `export.arxiv.org` for this project's Claude sessions (claude.ai, Settings, Capabilities),
   or start the workflow (about 20 runner hours, paid from the private repository's Actions
   minutes). See task 16.
4. **One TeX Live, 2026.** Done, with one deviation: the TeX Live 2026 files come from Ubuntu
   26.10's packages, not from CTAN's `texlive2026.iso`, because CTAN is not reachable from the
   build machine either; they are TeX Live 2026.20260711, pinned by hash. Compile rate 705 →
   706, match rate 87.4 % → 99.3 %, artifact 249.7 MB, new manifest.
5. **Native programs from source.** Done. The vendored dvips, asy, xindy and gnuplot are this
   round's builds by `build_tools.sh` from an empty `GALLEY_SRC`; tests and corpus as above.
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
   `utils/asymptote/examples` with Galley and with a native asy 3.09 built from the same source
   with the same features (`dev/build_asy_native.sh`, GLM; labels by the desktop TeX Live).
   196 PDFs are equal; 12 examples fail on both sides the same way (no GSL, missing `.obj`
   data, ConTeXt, `slope.asy` exhausting memory); 7 draw random data, so the native asy differs
   from itself between runs; `smoothelevation` is equal run alone (in the run it came after
   `slope` had crashed the page). Four fail in Galley only (task 18). Results with their causes:
   `dev/asycompare-results.jsonl`. The run found three bugs, fixed above: the stack pointer,
   the pipe cache, Ghostscript's standard input.
10. **Asymptote 3D like the desktop.** WebGL (`-f html`), V3D and PRC output now work (GLM,
    and XDR through `native/rpc`). Rendered bitmaps are left out, measured: Mesa 24.0.5 built
    with softpipe only (the one rasterizer that needs no JIT) is 14.5 MB stripped, 4.3 MB
    gzipped natively; asy 3.09's shaders need a one-line fix to compile at softpipe's GLSL 3.30
    (`n == 1` against an unsigned `n` in `blend.glsl`); rendering then takes 1.2 s (torus) to
    11.3 s (teapot) natively, two to three times that in WebAssembly. The artifact has 6.3 MB
    left. Porting Mesa to Emscripten is the open part: task 17.
11. **The programs reported as missing.** No corpus document calls R, bib2gls or inkscape.
    R: webR 0.6.0 is 48.6 MB (R.wasm alone 18.1 MB) and the artifact has 6.3 MB left; a page on
    claude.ai may not fetch it at run time either (its `connect-src` is `'self'` only). A
    self-hosted Galley could load it from the mirror. bib2gls (Java): TeaVM's compiler comes
    only from Maven Central, unreachable here; CheerpJ's runtime is served only from its
    vendor's CDN (and not licensed for bundling); Doppio (npm `doppiojvm` 0.5.0) is
    unmaintained since 2017 and needs a JDK 8 class library. inkscape has no browser build.
12. **xindy start.** Measured, not adopted: loading xindy's kernel as ECL bytecode starts in
    293 to 350 ms against 321 to 418 ms from source (fresh processes), of which ECL's own start
    is about 200 ms. Not worth a second link and 130 KB (`tex/build_tools.sh` has the numbers).
13. **The editor itself.** `test/editor_corpus.py` (six edits per document: type, delete, bold,
    math, table cell, footnote; lands, exact, undo; then the edited project compiles) and
    `dev/usertest.md` (one hour, five people; the owner runs it). Not yet run over the whole
    corpus.
14. Left alone: the documents' own faults.
15. **License.** Done: the AGPL-3.0 text in `LICENSE`, the components in `NOTICE`.

## Open tasks

16. **The arXiv corpus** (task 3's finish line): compile rate and match rate on the 1,000
    papers, every failure classified as in task 2. Needs arxiv.org (see task 3).
17. **3D bitmaps from Asymptote.** Port Mesa's softpipe OSMesa to Emscripten 3.1.6 and link it
    into asy with OpenGL on. Started: `meson` configures with a cross file once OSMesa is made a
    static library; compiling needs `_GNU_SOURCE`, `dladdr` and `os_sysinfo` stubbed (about 190
    errors at first count). Then asy's `blend.glsl` fix, asy with `--enable-offscreen`, and the
    size and time measured in the browser. Finish line: asy's 3D examples rendered as a
    desktop asy renders them (compared with `dev/asycompare.py` against a native asy built with
    the same OSMesa), or the measured reason it cannot fit.
18. **The four Asymptote examples Galley fails** (task 9). `functionshading`, `layers` and
    `spectrum` set `settings.tex="pdflatex"` (the last two with ocgx2 layers) and hang while
    asy measures labels: without the rehearsal the seventh TeX pipe run never returns, yet the
    same seven inputs replayed in a fresh worker (`tex-smoke.html`) all return. So it depends on
    state that asy's own run leaves, not on the TeX input; `orthocenter`, also pdflatex, works,
    as do the corpus figures asymptote.sty sends with pdflatex. `slidedemo` calls `asy()` to make
    its figures, asy started from asy, which one asy instance cannot run (a second instance, as
    TeX has, would). Finish line: all four equal to the native asy's PDFs.

## Rules

- No status commits ("Note ...", "Record ...") and no log in this file. One commit per
  finished task, its message saying what changed and the evidence (test counts, corpus count).
  If a task is blocked, say why under the task, once, and move on.
- Corpus results: one file, `dev/corpus-results.jsonl`, replaced by each full run; the
  comparison likewise in `dev/pdfcompare-results.jsonl`.
- Never put files into the tree by hand: kpathsea finds files through `ls-R`, which
  `build_tree.py tree` writes. Files reach the tree through a package in `CORE_SETS`,
  `DEB_SETS` or `FONT_PICKS`, or the `extra/` overlay, before `tree` runs.
- Commits use the author email `pedro.fernandezrackebrandt@merton.ox.ac.uk`.
- Compare against the real program, byte for byte, whenever one exists (xindy against CLISP's,
  PDFs against a desktop TeX Live). A plausible output is not the target.
- Patch original sources with small scripts that assert their anchor text exists, so a version
  bump fails loudly. Comments say why, in plain sentences.
- Run the corpus before publishing. Publishing to the claude.ai artifact needs Claude
  (`tex/publish_batches.py` plans the uploads, 256 MB limit); anywhere else, serve `dist/`.


## Status 2026-10-27

Claude completed tasks 0-15 of round 1. Remaining open tasks:

16. arXiv corpus: blocked (arxiv.org not reachable from build machine).
    Tool ready: dev/arxiv_corpus.py and .github/workflows/arxiv.yml.

17. 3D bitmaps from Asymptote: not started. Needs Mesa softpipe port to
    Emscripten 3.1.6. Documented in the task.

18. Four Asymptote examples Galley fails: functionshading, layers, spectrum
    hang on the seventh TeX pipe run; slidedemo needs nested asy. The pipe
    re-runs the transcript each time (patch_asy.py). The hang depends on
    state left by asy's own run. Not fixed.

Editor corpus test (test/editor_corpus.py) timed out waiting for window.ready
in this environment. The harness exists; a full run needs a working dist
served to the browser.

## Status 2026-10-27 (final)

Task 17 (asy 3D bitmaps): Not finished. Mesa softpipe port started but
blocked on "ld.wasm does not support shared libraries" even with static
library default. Built m4, bison, flex from source. Documented in
dev/mesa-port.md. Needs a custom OSMesa build or meson patch.

Task 18 (four asy examples): Pipe state reset added to tex/engine.js
(resets TeX instance before every pipe run). Dist rebuilt. Browser test
timed out on window.ready due to sandbox server issues. The fix is
committed but not verified against the four examples.

Both tasks need more work outside this sandbox.
