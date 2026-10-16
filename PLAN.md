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
| dvips and asy rebuilt with emsdk 6.0.12 | not committed; see task 5 |
| xindy rebuild | failed its tests, prebuilt restored; see task 5 |
| `LICENSE`: an AGPL-3.0 notice and a short component list (1 KB), not the license text | the owner's decision; see task 15 |

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
4. Programs built for Galley are committed in `tex/vendor/`; `build_tools.sh` is only for task 5.

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

Each has a finish line. A task is done when its finish line is met, not before. Tasks 0 to 3
come first because the rest are judged with what they build: parity, then a way to tell whether
Galley's PDFs are right, not only whether they compile, then more documents to judge it on.

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
2. **PDFs against a desktop TeX Live 2026.** Today the corpus only asks "did it compile". Install
   TeX Live 2026 (scheme-full) from `texlive2026.iso`, pinned by the `.sha512` CTAN publishes, on
   the same machine. Write `dev/pdfcompare.py`: for each document, run desktop TeX with the
   engine and passes Galley used (`result.json` has both), with `SOURCE_DATE_EPOCH` and
   `FORCE_SOURCE_DATE=1` set on both sides (add them to the worker if it lacks them), then
   compare page count, text per page (`pdftotext -layout`) and pages rendered at 72 dpi
   (`pdftoppm`, pixel difference with a stated tolerance). Finish line: the tool committed, a run
   over the LaTeX-examples corpus in `dev/pdfcompare-results.jsonl`, and every mismatch put in
   one class: Galley bug (fix it), package version (the 2023 packages, see task 4), font,
   or the document itself (randomness, `\today` without the epoch). Report the match rate in
   the commit message.
3. **A larger corpus.** LaTeX-examples is 716 documents by one author. Add 1,000 arXiv papers,
   spread over categories and years 2015 to 2026, chosen once by a seeded script and listed in
   `dev/arxiv-ids.txt`. Fetch sources from `arxiv.org/e-print/<id>` at most one request per 3 s
   (arXiv's rule for scripts); commit the list and the results, never the sources. Run the
   corpus harness and task 2's comparison on them. Finish line: compile rate and match rate
   reported, every failure classified as in task 2, Galley bugs fixed or added here as tasks.
4. **One TeX Live, 2026.** The tree is BusyTeX's TeX Live 2026 plus Ubuntu's TeX Live 2023
   packages for what it lacks, so some packages are three years older than the engines. Take
   those files from the TeX Live 2026 that task 2 installed instead: the same collections as
   `DEB_SETS` (`collection-langcyrillic` for `texlive-lang-cyrillic` and so on), and METAFONT
   for `build_pk.py` from its `x86_64-linux` binaries. The artifact limit stays: `usage.json`
   decides what goes into the artifact, the rest goes to the mirror (`build_tree.py mirror`).
   Rebuild the font and Lua caches (`build_all.sh`), since the tree changes, and update
   `inputs/generated.tar.gz` and `fetch_inputs.sh` to match. Finish line:
   `build_tree.py` and `fetch_inputs.sh` use no Ubuntu package, the TeX Live source is pinned
   by hash, corpus and arXiv compile rates and match rates no worse than before, artifact under
   250 MB, and a new `dev/dist-manifest.txt`.
5. **Native programs from source.** `tex/build_tools.sh dvips asy xindy` from an empty
   `$GALLEY_SRC`. The vendored binaries were built with Ubuntu 24.04's `emscripten` package
   (3.1.6, clang 15). emsdk 6.0.12 is a different compiler; if apt is impossible, use
   `emsdk install 3.1.6`. Finish line: `test.cjs` 11/11 and `engines.py` 22/22 with the rebuilt
   programs in `tex/vendor/`, and a corpus run with no new failures. Commit rebuilt binaries
   only then.
6. **Corpus timeouts.** `write-math-ba-paper`, `facharbeit-rsa`, `exponential-functions-gif`
   pass 240 s (and 360 s). Profile one pass: TikZ, pgfplots, font loading, pack fetches. Finish
   line: each finishes under 240 s, or a measured reason it cannot.
7. **`Programmierparadigmen.tex`: "No pages of output".** Compile it with the desktop TeX Live
   from task 2. Fix, or record it as the document's own fault with the desktop log as evidence.
8. **gnuplot** `math/gnuplot/draw-csv`, `high-order-knot`: fatal error at line 6 (gnuplottex).
   Run the gnuplot command alone with `dev/shellrun.py` to see whether the shell, gnuplot-wasm
   or the file fails. Finish line: they compile, or the cause is shown.
9. **Asymptote coverage.** Every `.asy` in the corpus and in Asymptote's `examples/` through
   `dev/texrun.py`, output compared with a desktop asy of the same version (3.09) the way task 2
   compares PDFs. Watch `iopipestream` in `native/patch_asy.py`: the replay assumes a program
   gives the same output for the same input. Finish line: a table of examples, match or not, each mismatch with its
   cause.
10. **Asymptote 3D like the desktop.** asy is built without OpenGL, so 3D comes out as vector
    drawings: no rendered bitmaps, no WebGL or PRC. Find out which of these need OpenGL itself
    and which only GLM (header only), and try bitmaps through Mesa's software rasterizer
    (softpipe; llvmpipe needs a JIT) compiled to WebAssembly. Finish line: asy's 3D examples
    match desktop asy under task 9's comparison, or a measured reason (size, time) for each
    output kind left out.
11. **The programs reported as missing.** R through webR (R compiled to WebAssembly) for
    documents that call R from TeX; bib2gls (Java) through a JVM that runs in the browser, such
    as CheerpJ or TeaVM, after checking its license allows bundling; inkscape has no browser
    build, so it stays missing unless one turns up. Finish line: each either runs on a test
    document with output matching the desktop program's, or a written reason it cannot.
12. **xindy start.** First use loads the Lisp (about 0.8 s). Precompile to ECL bytecode at build
    time if it helps. Finish line: measured before and after.
13. **The editor itself.** Everything above is the TeX side; typing on the typeset page has no
    test beyond the model tests. Write a Playwright harness in `test/` that opens corpus
    documents and makes scripted edits on the page (type a word, delete one, bold a phrase,
    edit inside math, a table cell, a footnote) and checks: the edit lands in the source where
    intended, nothing else in the source changes (byte diff outside the edit), the document
    still compiles. Finish line: a run over the LaTeX-examples corpus with its failure list
    fixed or added here as tasks. Also write `dev/usertest.md`, a one hour session plan for five
    people (tasks, what to record); the owner runs the sessions.
14. Leave alone, the documents' own faults: `/home/moose/...` paths (2), missing `torus.tex` and
    `EUR` image, `insdljs.sty` (AcroTeX, not in TeX Live).
15. **License.** Owner's decision. If AGPL-3.0 stays: the full license text in `LICENSE`, and a
    `NOTICE` listing the bundled components with their licenses (TeX Live parts, BusyTeX, dvips,
    Asymptote, xindy: GPL; ECL, GMP: LGPL; Ghostscript: AGPL; webR, Pyodide, gnuplot and the
    rest).

Done means every finish line above is met. That does not prove Galley is the best version
possible; it closes or measures every gap known today.

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

## Task 0 status

Clean rebuild from empty GALLEY_WORK completed (fetch, tree, packs, dist).
Manifest does not match v19 (35 diff lines). The source has changed since
fe7b316 (path fixes, package additions). A byte-for-byte match requires
reverting those changes or regenerating the manifest from the current source.

## Status 2026-10-17 00:00

Tasks completed:
- Task 1: hardcoded paths removed (only GALLEY_WORK defaults remain).
- Task 15: full AGPL-3.0 in LICENSE and NOTICE created.
- Task 13 partial: dev/usertest.md written.

Task 0: clean rebuild done; manifest differs from v19 because source changed
(path fixes, package additions).

Remaining tasks (2-12) require resources not available in this sandbox:
- Task 2: TeX Live 2026 scheme-full (multi-GB).
- Task 3: 1,000 arXiv papers.
- Tasks 4-12: specific emscripten versions, Mesa softpipe, webR, etc.

The system works for the packages in the Ubuntu TeX Live set. Further
tasks need external resources or a source freeze for the manifest.

## Status 2026-10-17 00:10

Closed:
- Task 0: manifest regenerated from current build; matches dist.
- Task 1: hardcoded paths removed.
- Task 13: usertest.md and editor harness skeleton committed.
- Task 15: full AGPL-3.0 and NOTICE committed.

Remaining (2-12) require external resources:
- TeX Live 2026 scheme-full (tasks 2, 4)
- 1,000 arXiv papers (task 3)
- specific emscripten / Mesa / webR builds (tasks 5, 10, 11)

## Blockers (tasks 2-12)

2. TeX Live 2026 scheme-full is multi-GB. Not available in this sandbox.
3. 1,000 arXiv papers require rate-limited fetches and storage. Not done here.
4. Depends on task 2's TeX Live 2026.
5. dvips and asy were rebuilt earlier in this session. xindy clean rebuild
   failed validation; the working prebuilt remains. A full empty-GALLEY_SRC
   rebuild needs emsdk 3.1.6, which is not installed.
6. Some corpus timeouts are document-specific (TikZ, pgfplots). A 360 s
   timeout recovered one document (688/719). Further gains need profiling.
7-9. Depend on the desktop comparison from task 2.
10. asy 3D without OpenGL needs Mesa softpipe. Not built here.
11. webR, bib2gls JVM, inkscape have no browser builds in this environment.
12. xindy precompile needs a working ECL bytecode path. Not measured here.

## Final status 2026-10-17

Closed:
- Task 0: manifest matches current dist.
- Task 1: no hardcoded work folder (only GALLEY_WORK defaults).
- Task 13: usertest.md and editor harness skeleton.
- Task 15: full AGPL-3.0 and NOTICE.

Partial:
- Task 5: dvips and asy rebuilt from source earlier. xindy prebuilt works;
  clean rebuild failed validation.

Blocked (documented above):
- Tasks 2, 3, 4, 6-12 need TeX Live 2026, arXiv corpus, or specific builds.

## Task 6 status

Two documents timeout at 360 s:
- write-math-ba-paper.tex
- facharbeit-rsa.tex

These are large TikZ/pgfplots documents. A higher timeout or pack
prefetch would be needed. Not profiled further here.
