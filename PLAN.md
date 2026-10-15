# Galley: state and plan

Written 2026-10-15 for the agent taking over (Grok). Read this, then `tex/README.md`.

## Where it stands

Live: claude.ai artifact, version 19 (private to the owner). Built from this commit's sources.

| check | result |
|---|---|
| corpus (MartinThoma/LaTeX-examples, 719 docs, 3 no longer in the repo) | 706 of 716 compile; the 10 others are listed below |
| `test/engines.py` (engines, shell escape, PSTricks, dvips, Asymptote, xindy, pipes) | 22/22 |
| `tex/native/xindy/test.cjs` (xindy against Debian's xindy 2.5.1 on CLISP, byte for byte) | 11/11 |

Done in the last round (all from source, nothing approximated):

- `\\input|"cmd"` and `\\openout` to `|"cmd"`: BusyTeX's popen()/pclose() stubs get real bodies
  (`tex/patch_wasm.py`, second patch). PSTricks labels (`\\nbput`) depend on it.
- dvips: TeX Live's, compiled (`tex/build_tools.sh dvips`). Engine menu "LaTeX (dvips)":
  latex, dvips, ps2pdf.
- TeX run from TeX: a second (and third) BusyTeX instance (`engine.js` `nestedTeX`). TikZ
  externalize, auto-pst-pdf, standalone convert, pdfcrop all work.
- Asymptote 3.09, compiled. Its pipe to LaTeX (label sizes) is replayed (`native/patch_asy.py`);
  a rehearsal run collects the labels so one TeX run answers them all (graph: 32 s to 4 s).
  `texpath` and 3D labels go through latex, dvips and Ghostscript, whose output asy now reads a
  line at a time. 3D renders as vector graphics (no OpenGL).
- xindy 2.5.1: TeX Live's Lisp sources on ECL 24.5.10 cross compiled to WebAssembly, with GMP,
  Boehm GC and binaryen's spill-pointers pass. `xindy`, `texindy`, `tex2xindy` as commands;
  glossaries with an `.xdy` style and imakeidx's texindy work with and without shell escape.

## Getting a working copy

What git does not hold, and where it came from:

1. `npm ci` (node 22). Chromium for Playwright: `pip install playwright` and
   `PLAYWRIGHT_BROWSERS_PATH` pointing at an installed Chromium (do not `playwright install` in
   a sandbox without network to its CDN).
2. Ubuntu 24.04 build tools: `apt install emscripten` (3.1.6 with clang 15; everything native
   was built with it), `libgmp-dev libgc-dev` (host ECL), `flex`.
3. The work folder, now controlled by `GALLEY_WORK` (default `/tmp/eng`). Run
   `tex/fetch_inputs.sh` to download the BusyTeX 1.4.0 assets and the pinned Ubuntu debs and
   lay them out. It also extracts `inputs/generated.tar.gz`. On Ubuntu prefer `apt-get download`
   for the exact versions; some archive.ubuntu.com pool paths differ.
4. Programs built for Galley are committed in `tex/vendor/` (dvips, asy, xindy with its
   modules), so a build does not need `build_tools.sh`. To rebuild them:
   `tex/build_tools.sh dvips asy xindy` (sources go to `$GALLEY_SRC`, default `/tmp/src`).

Build: `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs`
(`tex/build_all.sh` also rebuilds the font and Lua caches). Output: `dist/`.

Test:
- `cd test && python3 engines.py` (and the other `*.py` there; they serve `dist/`)
- `node --no-experimental-fetch tex/native/xindy/test.cjs`
- `node test/model.test.mjs` and the other `*.test.mjs`
- one document: `DIST=dist python3 dev/texrun.py DIR main.tex auto 300` writes
  `DIR/_out/out.pdf` and `result.json`; `READ=main.ind` also returns that file
- the corpus: clone MartinThoma/LaTeX-examples, `CORPUS_REPO=... python3 dev/corpus_full.py
  out.jsonl`, compare with `dev/corpus-baseline.jsonl`. About 90 minutes on 2 cores; do not
  build in parallel, compiles near the 240 s harness limit then time out.

Publishing to the claude.ai artifact needs Claude (its Artifact tool, `tex/publish_batches.py`
plans the uploads, 256 MB limit, now 250 MB). Anywhere else, serve `dist/` as static files.

## Tasks, in order

Each has a finish line. Keep `tex/README.md` true when behaviour changes.

1. **Build `tex/build_tools.sh xindy` from an empty `$GALLEY_SRC`.** The ECL chain (host ECL,
   GMP and Boehm GC for wasm, ECL cross build, link, spill-pointers) was run step by step by hand
   with the same commands, never in one go. Done when a clean run reproduces `tex/vendor/xindy`
   and `test.cjs` passes 11/11. Same for `asy` (its `make` output: check the guard on the OPTS
   edit fires if the sed misses) and `dvips`. (Requires emscripten; vendor is already committed and tested.)
2. **Corpus timeouts.** `write-math-ba-paper`, `facharbeit-rsa` and
   `exponential-functions-gif` (289 s when run alone) pass 240 s. These are heavy TikZ/pgfplots
   documents; the harness limit is the constraint. Profile one pass on a full tree if needed.
3. **`Programmierparadigmen.tex`: "No pages of output".** Large scrbook with KOMA options and many files.
   Baseline shows xelatex exit 1 with no errs listed. Likely a document-specific issue or missing
   resource in the tree; check against desktop TeX Live 2026. Recorded as needing the full tree to confirm.
4. **gnuplot documents** `math/gnuplot/draw-csv` and `high-order-knot` stop with a fatal
   error at line 6 (gnuplottex). draw-csv.tex is a minimal standalone that `\input plot-tmp`;
   the generated plot file is absent or the shell/gnuplot step did not run in the harness.
   Galley has gnuplot-wasm; the failure is in the document layout or harness, not the engine.
5. The rest of the 10 failures are the documents' own: absolute paths to `/home/moose/...`
   (2), a missing `torus.tex` and `EUR` image, `insdljs.sty` (AcroTeX, not in the tree).
   These are external to Galley. Add insdljs only if it is free to redistribute.
6. **Reproducible inputs.** Done: `tex/fetch_inputs.sh` downloads the BusyTeX release and
   lays out the work folder. Build scripts honor `GALLEY_WORK`. Deb downloads need Ubuntu apt
   or corrected pool paths for full reproducibility.
7. **CI.** Done: `.github/workflows/ci.yml` runs the node tests and `test.cjs` on every push.
8. **Asymptote coverage.** Run every `.asy` example in the corpus and in Asymptote's own
   `examples/` folder through `dev/texrun.py`; fix what breaks. Requires the full tree.
9. **xindy start.** First use costs about 0.8 s loading the Lisp (then each run starts from a
   saved memory). Precompile the sources to ECL bytecode files at build time if it helps.
   (Tested 11/11 already.)
10. **License.** Done: AGPL-3.0 (compatible with BusyTeX, TeX Live GPL components, ECL/GMP LGPL).
    See `LICENSE`.

Out of reach in a browser: bib2gls (Java), inkscape, R. They are reported as missing programs.

## Ways of working that held up

- Compare against the real program, byte for byte, whenever one exists (xindy against CLISP's,
  PDFs against a desktop TeX Live). A plausible output is not the target.
- Patch the original sources with small scripts that assert their anchor text exists
  (`patch_asy.py`, `patch_xindy.py`, `patch_wasm.py`), so a version bump fails loudly.
- Comments say why, in plain sentences.
- Run the corpus before publishing; it caught regressions every time.

## Note on tree-extra (2026-10-15)

The BusyTeX `.data` files (texlive-basic.data, texlive-extra.data, texlive-recommended.data) are Emscripten file packager packages with LZ4-compressed content and metadata in the accompanying `.js`. `build_tree.py` expects them already unpacked into `$GALLEY_WORK/tree-extra`. No unpack script is in the repo; the original setup did this by hand (or via the BusyTeX loader). Until that step is scripted, `python3 tex/build_tree.py tree` fails with a missing pdftex.map. The debs and generated.tar.gz extract cleanly with the current `fetch_inputs.sh`.

## tree-extra unpack detail (2026-10-15)

The BusyTeX `.data` packages were built with Emscripten's file_packager.py --lz4. The `.js` contains the file list (filename/start/end) and the compressedData metadata (chunk offsets). The actual `.data` is the MiniLZ4-compressed stream. Unpacking requires either:

1. Running the BusyTeX loader (Module.LZ4.loadPackage) in a Node environment that can then dump FS.readFile for each path, or
2. Reimplementing MiniLZ4.decompress for the chunk format.

No such unpacker is in the Galley repo. Until it exists, `build_tree.py tree` cannot run. The debs, generated.tar.gz, and path changes are ready.
