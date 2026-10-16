# Galley: state and plan

Rewritten 2026-10-16 after reviewing round 1 (main at `7e88000`). The round 1 status log is in git
history (`git show 7e88000:PLAN.md`). Read the rules at the end before the first commit.

## Where it stands

Live: claude.ai artifact, version 19, built from `fe7b316`. Its results are the baseline:

| check | baseline (v19) | round 1 |
|---|---|---|
| corpus, `dev/corpus-baseline.jsonl` (719 docs, 3 gone from the repo) | 706 of 716 | 688 of 719, 17 regressions |
| `test/engines.py` | 22/22 | not run |
| `tex/native/xindy/test.cjs` | 11/11 | 11/11 |

Round 1 is not finished. What it added and what this commit changes:

| piece | state |
|---|---|
| `GALLEY_WORK` in `build_tree.py`, `build_all.sh`, `build_fccache.py`, `build_pk.py` | kept; leftovers in task 1 |
| `tex/unpack_busytex.py` | **fixed here.** It dropped the last 2048 byte chunk of each package, so the last files came out cut or empty (`texlive/texmf.cnf`, `texmfcnf.lua`, an xdvi pixmap). It now reads the chunk sizes, checks the byte count, and reproduces the v19 `tree-extra` byte for byte (44,304 files, 0 differences). |
| `tex/fetch_inputs.sh` | **rewritten here.** It fetched 14 of the 44 Ubuntu packages, took `texlive-plain-generic` from a wrong pool path (404, skipped silently), fetched none of the METAFONT packages and did not unpack the tree. Now: all 44 plus the 3 METAFONT ones, each pinned by sha256 from noble's `Packages` index, the BusyTeX release pinned by sha256, unpacking included, any failure stops it. Run into an empty folder on 2026-10-16: every input equal to v19's byte for byte, and `tree` plus `packs` from them gave the published files exactly (256 of 256 `.wasm`). |
| CI | **fixed here.** Four of five node tests ran with `|| true`, and none of them exited nonzero on failure, so CI could not go red. The tests now set the exit code; the corpus model test runs on a pinned LaTeX-examples clone. |
| dvips and asy rebuilt with emsdk 6.0.12 | not committed; see task 2 |
| xindy rebuild | failed its tests, prebuilt restored. Task 1 is open. |
| `LICENSE`: an AGPL-3.0 notice and a short component list (1 KB), not the license text | the owner's decision; see task 9 |

Why the corpus regressed: the work folder lacked 17 of the 25 packages in `DEB_SETS`, so the tree
lacked what they carry.

| regression | cause |
|---|---|
| `asymptote.sty` not found (3 docs) | no `asymptote` package |
| `multido.sty`, `nth.sty`, `lambda.sty` not found (3 docs) | `texlive-plain-generic` 404. They are in it; the log's "not in the Ubuntu 2023 set" was wrong |
| `cyrillic`: babel, unknown language | no `texlive-lang-cyrillic` |
| `cv-curriculum-vitae` font not loadable, crashed or empty runs of `Analysis I`, `CNN-Intro`, `GeoTopo`, `car-bottom`, `sphere-*` (all XeLaTeX) | probably fontconfig: the caches in `generated.tar.gz` describe the full tree. Confirm in task 0 |
| `entropie-distanz`, `activation-functions`, `chemistry-example` crashed or empty | unknown; recheck in task 0 |

`asymptote.sty` copied in by hand never worked because kpathsea finds files through `ls-R`,
which `build_tree.py tree` writes at its end (`write_lsr`). A file added after that is in the
packs and the index and still invisible. Files reach the tree only through a package in
`DEB_SETS` or the `extra/` overlay, before `tree` runs.

## Building

1. `npm ci` (node 22); `pip install lz4 playwright`; Chromium for Playwright through
   `PLAYWRIGHT_BROWSERS_PATH`.
2. `tex/fetch_inputs.sh` lays out `$GALLEY_WORK` (default `/tmp/eng`): about 8 GB, rerunnable.
3. `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs` gives
   `dist/`. Use this, not `build_all.sh`: the font and Lua caches in `generated.tar.gz` were made
   for exactly this tree, so they need no rebuild unless the tree changes.
4. Programs built for Galley are committed in `tex/vendor/`; `build_tools.sh` is only for task 2.

Tests:
- `cd test && python3 engines.py` (and the other `*.py` there; they serve `dist/`)
- `node --no-experimental-fetch tex/native/xindy/test.cjs`
- `node test/model.test.mjs` and the other `*.test.mjs` (CI runs them)
- one document: `DIST=dist python3 dev/texrun.py DIR main.tex auto 300` writes
  `DIR/_out/out.pdf` and `result.json`
- the corpus: clone MartinThoma/LaTeX-examples at `8bfd313b8d98`,
  `CORPUS_REPO=... python3 dev/corpus_full.py OUT.jsonl`. About 90 minutes on 2 cores. Run
  nothing else meanwhile: the harness limit is 240 s and a loaded machine times documents out.

## Tasks, in order

Each has a finish line. A task is done when its finish line is met, not before.

0. **Parity with v19.** Start from an empty `GALLEY_WORK`, run `fetch_inputs.sh`, build, test.
   Finish line:
   - `cd dist/tex && find . -type f | sort | xargs sha256sum | diff - ../../dev/dist-manifest.txt`
     prints nothing (the manifest lists v19's files; a `.js` line may differ only if that worker
     source changed since `fe7b316`, a `.wasm` line never)
   - `engines.py` 22/22 and `test.cjs` 11/11
   - every document ok in `dev/corpus-baseline.jsonl` is ok again. One that is not is a bug to
     fix before task 1. Replace `dev/corpus-full-results*.jsonl` with this run as
     `dev/corpus-results.jsonl`.
1. **No hard coded work folder.** Still `/tmp/eng`: biber paths, `MIRROR_OUT` and
   `mirror-extra` in `build_tree.py`; `build_luacache.py`; `build_icu.sh`; `swap_wasm.py`;
   `publish_batches.py`; `dev/corpus_full.py` (`CORPUS_REPO`). Finish line:
   `grep -rn /tmp/eng --include=*.py --include=*.sh .` shows only defaults of
   `GALLEY_WORK`, and task 0's manifest still matches with `GALLEY_WORK` elsewhere.
2. **Native programs from source.** `tex/build_tools.sh dvips asy xindy` from an empty
   `$GALLEY_SRC`. The vendored binaries were built with Ubuntu 24.04's `emscripten` package
   (3.1.6, clang 15). emsdk 6.0.12 is a different compiler; if apt is impossible, use
   `emsdk install 3.1.6`. Finish line: `test.cjs` 11/11 and `engines.py` 22/22 with the rebuilt
   programs in `tex/vendor/`, and a corpus run with no new failures. Commit rebuilt binaries
   only then.
3. **Corpus timeouts.** `write-math-ba-paper`, `facharbeit-rsa`, `exponential-functions-gif`
   pass 240 s (and 360 s). Profile one pass: TikZ, pgfplots, font loading, pack fetches. Finish
   line: each finishes under 240 s, or a measured reason it cannot.
4. **`Programmierparadigmen.tex`: "No pages of output".** Compile it with a desktop TeX Live
   2026. Fix, or record it as the document's own fault with the desktop log as evidence.
5. **gnuplot** `math/gnuplot/draw-csv`, `high-order-knot`: fatal error at line 6 (gnuplottex).
   Run the gnuplot command alone with `dev/shellrun.py` to see whether the shell, gnuplot-wasm
   or the file fails. Finish line: they compile, or the cause is shown.
6. **Asymptote coverage.** Every `.asy` in the corpus and in Asymptote's `examples/` through
   `dev/texrun.py`. Watch `iopipestream` in `native/patch_asy.py`: the replay assumes a program
   gives the same output for the same input. Finish line: a table of examples, pass or fail,
   each fail with its cause.
7. **xindy start.** First use loads the Lisp (about 0.8 s). Precompile to ECL bytecode at build
   time if it helps. Finish line: measured before and after.
8. Leave alone, the documents' own faults: `/home/moose/...` paths (2), missing `torus.tex` and
   `EUR` image, `insdljs.sty` (AcroTeX, not in TeX Live).
9. **License.** Owner's decision. If AGPL-3.0 stays: the full license text in `LICENSE`, and a
   `NOTICE` listing the bundled components with their licenses (TeX Live parts, BusyTeX, dvips,
   Asymptote, xindy: GPL; ECL, GMP: LGPL; Ghostscript: AGPL; Pyodide, gnuplot and the rest).

Out of reach in a browser: bib2gls (Java), inkscape, R. They are reported as missing programs.

## Rules

- No status commits ("Note ...", "Record ...") and no log in this file. One commit per
  finished task, its message saying what changed and the evidence (test counts, corpus count).
  If a task is blocked, say why under the task, once, and move on.
- Corpus results: one file, `dev/corpus-results.jsonl`, replaced by each full run.
- Never put files into the tree by hand; see `ls-R` above.
- Commits use the author email `pedro.fernandezrackebrandt@merton.ox.ac.uk`.
- Compare against the real program, byte for byte, whenever one exists (xindy against CLISP's,
  PDFs against a desktop TeX Live). A plausible output is not the target.
- Patch original sources with small scripts that assert their anchor text exists, so a version
  bump fails loudly. Comments say why, in plain sentences.
- Run the corpus before publishing. Publishing to the claude.ai artifact needs Claude
  (`tex/publish_batches.py` plans the uploads, 256 MB limit); anywhere else, serve `dist/`.
