# C and C++ for everything that computes: the plan

Written 2026-11-20 on branch `cpp-plan` (from main 4063ad1), by an agent that read the code and
measured, and built nothing. Pedro's wish, given the same day: after the UI and UX work, move
everything possible in Rikuy to C or C++ compiled to WebAssembly, even where the gain is small,
at maximum quality. This file says what computes, what each port would gain and cost, the order
of work in batches an agent can each finish and test, and what stays JavaScript and why.

Read first: AGENTS.md, `docs/ARCHITECTURE.md` section 17 (the native core as it is), PLAN.md
tasks 52 (the parse port) and 53 (the incremental model build).

## Summary

| batch | what | where it gains | expected gain |
|---|---|---|---|
| B0 | JavaScript first: the preamble read once per text, the .bib parsed once per text, the undo record from the edits | every full model build; typing in the preamble; long bibliographies | measured: a full build of the 141 KB paper 47 to 19 ms, a keystroke in its `\title` 97 to 30 ms; 46 ms less per full build with a 2 MB .bib |
| B1 | the source scanner in C++ (comments, the preamble's end, packages, the document's signatures, scripts), and the texts kept in the core | full builds, every keystroke | about 2.5 ms per full build after B0; 0.4 to 0.8 ms per keystroke |
| B2 | the parse made incremental in the core, edits sent as splices | every keystroke on long documents, phones | est. a keystroke's model 1.8 to 0.5 ms (paper), 7.2 to 1.5 ms (400 KB); about 6 times that at a phone's speed |
| B3 | the model's text runs (characters, source maps, word counts) in C++ | full builds, first loads | est. a full build 19 to 13 ms (paper) |
| B4 | diff and three way merge | Review's marks, merging a coauthor's copy, Word import | est. 3 times on the diff; nothing per keystroke |
| B5 | the bibliography (.bib reading and formatting) | opening a project, editing a .bib | est. 46 to 15 ms for a 2 MB .bib |
| B6 | the TeX worker's byte work: SHA-256, synchronous gunzip, Type 1 ciphers | a document's first compile | est. 4 to 5 times on those steps: tens to a few hundred ms of a first PDF |
| B7 | zip and XML: Word files, project .zip files (no more JSZip from a CDN) | Word import and export, project zips | small speed; one hardened zip reader, no third party script fetched at run time |
| B8 | the small pure functions (problems, the TeX log, siunitx, brackets, scripts, bidi, the page plan, hashes) | after a pause, per compile | near zero; for completeness, under the rule below |
| B9 | the edits on strings (tables, lists, fonts, paragraphs, page, styles, references...) | one click each | none a person notices; 200 to 400 KB; hosted only; optional |
| B10 | the model's Builder itself | full builds | decide after B3; very high risk |
| B11 | line breaking and layout (research, a new engine, not a port) | first loads, every keystroke | the largest gain left (layout is 87 % of a long document's first load), and the largest risk |

B0 is JavaScript and comes first: today a third or more of a full model build is the same
comments stripped from the same text again and again (found while measuring, below). Every later
benchmark would otherwise compare C++ against waste.

## 1. The bar, and what does not change

- **What stays as it is.** The JavaScript of every ported function stays: it is the fallback
  (no core yet, a host whose policy compiles no WebAssembly, `coreCanRun`; a trap, after which the
  core is off for the session) and the reference the oracle holds the C++ to. The build stays
  reproducible byte for byte (`sh tex/build_tools.sh core`, checked by `vendor.yml`), the module
  is fetched once the page is idle and checked against the hash in the bundle, and nothing in the
  core touches the page.
- **The bar.** ARCHITECTURE section 17 keeps a port "only if it is identical everywhere and at
  least twice as fast as a call, crossings included". Pedro asks for C++ even where the gain is
  small. Proposed instead, written into section 17 by B1: a port is kept when it is identical
  everywhere (the oracle below), never slower in the situation it serves with every crossing
  counted (medians, both orders, at a desktop's speed and at `--cpu 6`), and within its size
  budget (section 5). Decided 2026-11-20 (section 8).
- **The oracle**, for every batch: identical results to the JavaScript on (1) every document of
  the repository (`sample/`, `dev/bench/`, `test/fixtures/`), (2) the 716 documents of the
  LaTeX-examples corpus where `CORPUS_DIR` names a clone (every file, and every document's model
  built both ways), (3) thousands of random inputs from a seeded generator, (4) random edit
  streams over real documents, (5) the hostile cases (nesting past the caps, lone surrogates,
  CRLF, unclosed constructs, sizes past the limits), and (6) at least one bug planted in the C++
  that must make the test fail. The existing suites of the ported module run twice, core off and
  core on.

## 2. Measured today

On this machine, 2026-11-20: node 22, one core (`taskset -c 0`), medians, while three other
agents ran browser suites on the two cores. Absolute times are 1.3 to 3 times those of PLAN.md
task 52; ratios measured in one process are sound. Scripts were scratch files outside the
repository (`dev/bench_native.mjs` ran as it is). The paper is `dev/bench/long` (141 KB, its
`refs.bib` 10 KB); the generated document is `bench_native.mjs`'s (401 KB, 18,749 nodes).

| what | input | time |
|---|---|---|
| `parseJS` | paper / generated | 2.5 to 8.0 ms / 7.3 to 8.3 ms (runs differ) |
| `nativeParse`, the whole call | paper / generated | 0.8 to 1.1 ms / 3.5 ms |
| of it: the text into the core (`put`) | paper / generated | 0.22 ms / 0.63 ms |
| of it: `core_parse` | paper / generated | 0.95 ms / 2.43 ms |
| of it: `readTree` (the objects) | paper / generated | 0.16 ms (6,222 numbers) / 0.78 ms (104,566) |
| one call into the core | | 2 to 5 ns |
| `buildModel`, keystroke in a paragraph with a citation (full build) | paper | 47 to 67 ms (task 52: 16 ms) |
| `buildModel`, keystroke in `\title` (full build) | paper | 87 to 97 ms |
| `buildModel`, keystroke in a plain paragraph (fast path) | paper | 1.8 ms |
| `buildModel` keystroke / first load (`bench_native.mjs`) | generated | 15.6 ms JS, 7.2 ms with the core / 198 ms, 159 ms |
| `scanUserSigs` (every keystroke, fast path too) | paper / generated | 0.44 ms / 0.81 ms |
| `readPage` when the preamble changed | paper | 60 ms |
| undo record's `diff` (editor.js) | paper | 1.1 ms |
| `changes()`, 36 changes (Review's marks) | paper | 6.6 ms |
| `merge3`, 36 changes mine, 12 theirs | paper | 0.75 ms |
| `spellPlan`, first run | paper | 4.2 ms |
| `findProblems` | paper | 7.1 ms |
| `parseBib` | 10 KB / 2 MB (7,913 entries) | 0.3 ms / 46 ms |
| `formatEntry` of every entry | 2 MB .bib | 63 ms |
| `buildWordDoc` | paper | 38 ms |
| `unzip` and `extract` | `test/fixtures/word-rich.docx` | 4.4 ms |
| a graph formula sampled 2,000 times | `a sin(b x) + x^2/(1+x^2)` | 0.13 ms |
| `parseTeXLog` | 2,000 lines | 1.1 ms |
| `fflate.gunzipSync` | 4 MB unpacked | 64 ms |
| `sha256hex` (tex/engine.js) | 4 MB | 68 ms |
| `readLists`, `tablesIn` with `parseTable`, `scriptNeeds` | paper | 0.11, 0.06, 0.01 ms |

**Where a full build goes** (Chromium's profiler format from `node --cpu-prof`, 40 full builds of
the paper, self time): the garbage collector 21 %, model.js 30 %, looks.js 17 %, preamble.js 9 %,
bib.js 6 %, styles.js 5 %, the core 3 %. By function: looks.js `stripComments` and `preambleEnd`,
preamble.js `stripComments` and `preambleEnd`, styles.js `preambleEndOf` and `stripCommentsOf`,
and looks.js `startsectionShapes` together are more than half. In `\title`, preamble.js's pair
alone is 42 % (pagesrc.js `readPage` calls nine readers, each stripping the comments of the first
200,000 characters of the file, one character at a time into a new string).

**Four findings that are JavaScript, not language** (B0):

1. The full build is three times what task 52 measured (16 ms on 2026-11-13): B4 (2026-11-14) and
   the round 3 batches added readers (looks.js, styles.js, pagesrc.js `readPage`) that each strip
   comments again. Memoizing the three pairs of functions (the last 8 texts, compared by string)
   gave, in a scratch copy: the paper's full build 47 to 19 ms, its `\title` keystroke 97 to 30 ms,
   the fast path unchanged (1.8 and 2.7 ms in two runs, noise; it reads no preamble). The output is
   the same by construction (pure functions of a string).
2. `Builder.ensureBib` (model.js 2022) parses every .bib on every full build: 0.3 ms for 10 KB,
   46 ms for a 2 MB .bib, on every keystroke in a paragraph with a citation.
3. `App.record` (app.js 1054) diffs whole files after every commit, though `commit` knows the
   edits: 1.1 ms a keystroke on the paper.
4. `incremental()` (model.js 478) runs `scanUserSigs` over every file and parses the whole main
   file on every keystroke: 0.44 + 1.0 ms on the paper, 0.81 + 3.5 ms on the generated document,
   most of the fast path. B1 and B2 take these into the core.

After the memo, the profile of a full build is: model.js 47 % (`text`, `inl`, `trimInl`,
`countWords` and its regular expression, `first`, `last`: about 13 ms of a 25 ms build), the
garbage collector 18 %, bib.js 6 %, the remaining comment scans 9 %. That is B3's target.

## 3. Inventory

Lines are `wc -l`; hotness is how often it runs: per keystroke, per full build (a keystroke
outside a plain paragraph, a preamble edit, a first load), per pause (debounced), per command (a
click), per compile, per load, rare. Verdict: **port** (worth it), **marginal** (possible, gain
near zero), **stays** (not possible, or JavaScript is the right tool; section 7 says why).

### On the keystroke path

| module | lines | what computes | hot | crossing | verdict |
|---|---|---|---|---|---|
| parser.js | 781 | `parseJS` (ported: parse.cc, 1286 lines); `scanUserSigs` (143); `isBalanced` (731) | keystroke | text in (0.2 to 0.6 ms), numbers out | sigs: port (B1); incremental parse: port (B2) |
| model.js | 3915 | `Builder` (623 to 3657): `flow` (1398, 411 lines), `inl` (2983, 99), `cmd` (3124, 407), `text` (3096, 28), `Acc` (3710), `trimInl` (3732), `countWords` (1871); `incremental` (478 to 590) and its helpers (348 to 475) | full build; fast path per keystroke | the model is an object graph that render.js, editor.js, find, spelling and Word read: everything must come back as objects | text runs: port (B3); fast path's parse: B2; Builder: B10, decide later |
| preamble.js, looks.js, styles.js | 458, 485, 835 | `stripComments`/`preambleEnd` (16, 32), (50, 61), (`preambleEndOf` 211, `stripCommentsOf` 216); `packages` (55); `readHeadLooks`, `startsectionShapes` (333), `thmMakersIn`, `readEnvBegin` | full build, many times | text in once if the core keeps it | B0 (memo), then port (B1); the readers: B9 |
| pagesrc.js | 1650 | `readPage` (1517) and its nine readers | full build when the preamble changed | as above | B0, then B1; the readers B9 |
| lists.js, refsrc.js, scripts.js | 1209, 563, 338 | `listSetup`, `formatOf`, `numText`, `bulletGlyph`; `refsSetup`; `rtlDocument`, `languageDir` | full build | small strings | B9 (lists, refsrc readers); scripts: B8 |
| bib.js | 505 | `parseBib` (6 to 97), `texToPlain` (98), `parseNames` (148), `formatEntry` (219), `shortAuthors`, `entryYear` | full build (B0 caches it) | .bib text in, entries out | B0 cache, then port (B5) |
| siunitx.js | 292 | `siNum`, `siUnit`, `siTex` | per formula drawn with `\num`, `\SI` | short strings | marginal (B8) |
| editor.js | 394 | caret to source and back (DOM and model), `diff` (386), `escapeTeX` | keystroke | DOM | the undo `diff`: B0 in JavaScript; rest stays |
| render.js | 1112 | model blocks to DOM, KaTeX | keystroke (changed blocks) | DOM | stays |
| layout.js | 1443 | `measure` (DOM), `plan` (395 to 681, arithmetic, under 1 ms), `apply`, headers and footers (`hfRuns` 1258) | keystroke | DOM measurements in | `plan`, `hfRuns`: marginal (B8); measuring: B11 |
| app.js | 5398 | the shell; `cjkOrder` runs three patterns over every file per build | keystroke | DOM | stays; `cjkOrder`'s scan: B1 |
| widget.js, ui/dom.js | 295, 32 | `hashText`, `textSig` (FNV over every file) | per compile and save | strings | marginal (B8) |

### Off the keystroke path

| module | lines | what computes | hot | verdict |
|---|---|---|---|---|
| diff.js | 132 | `diffSeq`, `myers`, `backtrack`, `hunks` (68), `wordDiff` (85), `changes` (102) | per pause with markup shown; Review; Compare | port (B4) |
| share.js | 482 | `merge3` (239), `mergeProjects` (261), `findComments` (162), links (CompressionStream) | per coauthor copy; comments per pause | merge: port (B4); links: stays (native streams) |
| wordsync.js | 715 | `alignRuns` (28), `textHunks` (160), `planImport` (246), `mathPatch` (649) | Word import | the diffs: B4; the rest stays |
| spell/words.js | 496 | `spellPlan` (357): words of the model's segs, languages | per pause (0.2 ms after a keystroke, blocks cached; 4.2 ms first) | marginal; Hunspell is already C++ |
| problems.js | 152 | `findProblems` (40): labels, references, citations, environments, braces | per pause (350 ms) | marginal (B8) |
| find.js | 478 | the query as a RegExp, Word's wildcards, hits mapped to the source; `blockText` reads the DOM | per search | stays (V8's regular expressions are native code) |
| fences.js, minimal.js, wordmath.js | 268, 160, 744 | brackets in the equation field; the smallest patch of an edited row (asks KaTeX per candidate); typing math through MathLive | per equation edit | fences: marginal (B8); minimal, wordmath: stay |
| table.js | 2175 | `parseTable` (184), `parseSpec` (112), every table operation as edits | per command | B9 |
| charfmt.js, parasrc.js, wrap.js, blockenv.js | 1571, 1144, 382, 110 | character and paragraph formatting as edits | per command | B9 |
| pagesrc.js edits, styles.js, looks.js edits, refsrc.js, preamble.js edits, outline.js, picture.js, drawing.js, props.js, cover.js, quickparts.js, forms.js, fields.js, autocorrect.js | about 5,000 | edits on strings; drawing.js also reads a TikZ subset to draw it | per command | B9 |
| graph.js | 1058 | `graphKit` (14 to 876): the formula language (`tokens` 63, `parse` 126, `compile` 225), sampling, fits, drawing on a canvas | in each graph's sandboxed frame; per graph inserted | stays |
| wordast.js | 931 | `buildWordDoc` (173): the model walked into pandoc's JSON | per Word export (38 ms; pandoc then takes seconds) | stays |
| docx.js | 1036 | `unzip` (29, fflate), `badZip64` (77), `zip` (123), `parseXml` (162), `serialize`, `extract` (304 to 502) | per Word import and export | port (B7) |
| wordbidi.js | 307 | direction runs by the Unicode bidirectional classes | per Word export | marginal (B8) |
| wordjobs.js, wordworker.js, pandoc.js | 1365, 115, 99 | orchestration of pandoc runs | per Word action | stays |
| tex.js | 244 | `parseTeXLog` (183) | per compile (1.1 ms) | marginal (B8) |
| paste.js | 269 | HTML from the clipboard to LaTeX, walking the DOM | per paste | stays |
| review.js, collab.js, nav.js, ui/*, cmd/*, ribbon/*, keys.js, commands.js | about 19,000 | DOM, the ribbon, dialogs, panes, the command registry | per event | stays |
| store.js, pwa.js, sw.js, git.js, gitauth.js, pdfview.js, tour.js, spell/client.js, spell/worker.js, spell/harper.js, word.js | about 2,200 | IndexedDB, the installed app, git through isomorphic-git, pdf.js, workers | per event | stays |

### The TeX worker (tex/)

| file | lines | what computes | hot | verdict |
|---|---|---|---|---|
| engine.js | 2152 | the compile loop around BusyTeX (glue); `sha256hex` (130: mirror packs, every compile's preamble inputs, format keys); `gunzip` (158) through fflate on the synchronous path: `loadPackSync` (282, a pack TeX asks for in the middle of a run), mirror packs (683), SyncTeX (1446); `t1xRestore` (309: both Type 1 ciphers on every font read); `quickHash` (1204), `sameBytes` (1425); `pageLines`, `logSig`, `pdfCore` (format checks) | per compile; first compiles most | byte work: port (B6); the loop: stays |
| shell.js | 350 | the shell's syntax for `\write18` | per shell escape | stays (glue) |
| tools.js | 906 | running dvips, asy, xindy, Ghostscript, gnuplot, Python; `proxyFS`; `pdfcrop`'s arguments | per program run | stays (the programs are already C) |

### Already native

TeX (BusyTeX's pdfTeX, XeTeX, LuaHBTeX), biber, dvips, Asymptote with Mesa, GSL and FFTW,
gnuplot, Ghostscript, xindy (on ECL), Hunspell and MyThes (C++), Harper (Rust), pandoc
(Haskell), Python (Pyodide), and `parse()` (the core). The browser's own C++ already does the
asynchronous gunzip (`DecompressionStream`), compression for share links, SHA-256 where it can
wait (`crypto.subtle`), and text encoding.

## 4. How every batch is built

- **Two modules.** `rikuy-core.wasm` for the page (and the Word worker, which instantiates its own
  copy from the same hashed file), and `rikuy-texcore.wasm` for the TeX worker. One page module
  keeps one fetch, one hash and one instance holding the texts; the worker's module is apart
  because it lives in `dist/tex` (the manifest, the artifact's packs, the worker's own boot) and
  carries libdeflate, which the page does not need (the page inflates with the browser's
  `DecompressionStream`).
- **Sources.** `tex/native/core/<area>.cc` beside `parse.cc` (`scan.cc`, `incr.cc`, `text.cc`,
  `diff.cc`, `bib.cc`, `zip.cc`, `xml.cc`, ...), sharing `core.h` (`Out`, `Text`, `Map`, `jsSpace`).
  `CORE_SOURCES` in `tex/build_tools.sh` names them in order (the order is the module's bytes).
  `tex/native/texcore/` holds `texcore.c` and libdeflate's decompressor (`lib/deflate_decompress.c`,
  `gzip_decompress.c`, `utils.c`, `crc32.c`; a release tarball pinned by SHA-256 in
  `tex/fetch_inputs.sh`, a line in `SOURCES.md` and `NOTICE`). C++17 without exceptions or RTTI,
  no standard containers, emmalloc, `STANDALONE_WASM`; every read bounded, every loop advancing, a
  depth cap that answers "no" instead of overflowing.
- **Tables come from the JavaScript**, never copied into C++: at load, as `tables()` in
  src/native.js sends parser.js's `PARSE_TABLES` (one string, sections split by U+0003, entries by
  U+0001, key and value by U+0002). Model tables (`STY`, `DECL`, `INVIS`), bib.js's `LOGOS` and
  months, siunitx's prefixes and units go the same way. Character classes the JavaScript takes
  from its engine (`\p{L}`, `\p{N}`, `\p{M}`, `\s`, the bidirectional classes) are generated by a
  node script (`dev/unitables.mjs`) into a committed header (`tex/native/core/unitables.h`); `npm
  test` generates it again and compares, so node's Unicode and the core's cannot drift apart
  unseen. This pins one Unicode version in every browser, where `\p{L}` in Safari and Chrome may
  differ by a release: say so in PLAN.md when B3 lands.
- **Texts kept in the core** (from B1). The core holds each file's last text under a file number
  and a version; JavaScript sends a text once per change (as UTF-8 through `encodeInto`, as
  `put` does), and from B2 a keystroke sends only the splice (offset, length removed, text
  inserted), so a keystroke crosses in proportion to the edit, not the document. Every later
  function takes (file, version, offsets). A call with a version the core does not hold answers
  null, and the JavaScript runs. `core_forget` drops a project's texts on a project switch.
- **Results** come back as an `Out` list of 32-bit numbers, read into exactly the objects the
  JavaScript makes, key for key and in its order of keys (as `readTree`); substrings as offsets
  sliced from the JavaScript's own string; generated text (a seg's characters, a formatted
  entry) in a second UTF-16 buffer decoded with `TextDecoder('utf-16le')`.
- **Hooks.** Each ported function gets a setter like `setNativeParse` in its own module, so the
  module never imports the core, and the tests switch the core off and on per function.
- **Flags per module.** Task 52 found `-Os` makes `parse.cc` 22 KB instead of 52 at no measured
  cost. Each batch measures `-O2`, `-O3` and `-Os` and takes the smallest within 5 % of the
  fastest (per file flags are allowed; the link's level decides wasm-opt). No SIMD at first (it
  would need a second build for browsers without it).
- **Security.** Every batch reads text a stranger can send (a share link, an imported project,
  a .docx, a pack from a mirror): the security audit skill's quick profile on the changed files,
  the hostile review of docs/REVIEW_PROCESS.md, and the planted bugs. A trap in any function turns
  the whole core off for the session (its heap may be half written), as now.
- **Done when**, for each batch: the oracle green (`npm test`, `node test/native.test.mjs
  <corpus>`, `npm run test:corpus`, `INCR_FULL=1 node test/incremental.test.mjs <corpus>` where the
  model is touched), `npm run test:browser` and the suites of the touched area (AGENTS.md,
  "Checking a change"), the benchmark's numbers in PLAN.md (desktop and `--cpu 6`), the module
  rebuilt byte for byte from another folder, its bytes against the budget, and a commit per
  finished batch.

## 5. The batches

### B0. JavaScript first: read once what is read many times

- **Files.** src/preamble.js (`stripComments` 16, `preambleEnd` 32), src/looks.js (50, 61),
  src/styles.js (`preambleEndOf` 211, `stripCommentsOf` 216); their callers in pagesrc.js (55
  uses), parasrc.js, charfmt.js, lists.js, refsrc.js, props.js, scripts.js; src/model.js
  `ensureBib` (2022); src/app.js `record` (1054) and `commit`.
- **Change.** A memo of the last 8 texts for each of the six functions (by `===`, which compares a
  string's characters once and is free for the same string). The three copies differ past their
  caps (preamble.js strips 400,000 characters and keeps the rest as it is; looks.js strips 200,000
  and drops the rest; styles.js strips all it is given): memoize each as it is; join them only
  where each caller's tests and the corpus say the difference cannot show. `parseBib` cached by
  file name and text (the entries are read, never written: freeze them in the development build to
  prove it). `record` takes the changed range from the edits it is given (one edit per file is the
  common case), else compares 4096 code units at a time as `incremental()` does.
- **Oracle.** `npm test`; every corpus model's `modelText` equal before and after (a one-off
  script over the 716 documents); `INCR_FULL=1` incremental streams; history.py for undo.
- **Benchmark.** `dev/bench_native.mjs` gains three situations: a keystroke in `\title`, a
  keystroke in a paragraph with a citation (the full build), and the paper with a 2 MB .bib.
- **Gain** (measured in a scratch copy): full build 47 to 19 ms, `\title` keystroke 97 to 30 ms,
  46 ms less per full build with a 2 MB .bib, 1.1 ms less per keystroke for the undo record.
- **Size.** None. **Risks.** A memo that outlives a document holds up to 8 texts (bounded).

### B1. The source scanner, and the texts kept in the core

- **Files.** New `tex/native/core/scan.cc`; src/native.js (the per file texts, `core_forget`);
  src/preamble.js, looks.js, styles.js (the six functions of B0 ask the core first);
  src/parser.js `scanUserSigs` (143); src/app.js `cjkOrder` (its three patterns) and src/scripts.js
  `scriptsIn` (104). ARCHITECTURE section 17: the texts, and the bar of section 1 above.
- **C++.** One pass per text version: comment ranges (so JavaScript builds a stripped string from
  them with `slice` and `' '.repeat`, in proportion to the comments, not the text), the offset of
  `\begin{document}` outside comments, the `\usepackage` and `\RequirePackage` lines, the user
  signatures as `scanUserSigs` reads them, and whether kana, hangul or Han occur.
- **Oracle.** test/native.test.mjs: each function against its JavaScript on every file of the
  repository and the corpus (.tex, .sty, .cls), 3000 random TeX-like texts weighted to `%`, `\%`,
  `\\%`, CRLF, U+2028, lone surrogates and `\begin{document}` inside comments, 2000 random edits;
  test/preamble, looks, styles, page, para, lists, bib (refs), font tests core off and on.
- **Benchmark.** Per call, and per full build and keystroke in bench_native.mjs.
- **Gain.** After B0: about 2.5 ms per full build on the paper; `scanUserSigs` 0.44 and 0.81 ms
  per keystroke to about 0.05 (once B2 keeps it incremental).
- **Size.** About 8 KB. **Risks.** Three strippers that differ past their caps; JavaScript's `\s`
  (core.h `jsSpace` has it); a text the core holds must never be read under another version.

### B2. The parse made incremental, in the core

- **Files.** New `tex/native/core/incr.cc`, parse.cc's state made resumable; src/parser.js (an
  incremental `parseEditJS`, the reference, with the same algorithm); src/native.js; src/model.js
  `incremental` (478) and `parseCached` (615), `parsedText` (614).
- **C++.** The core keeps the last tree's children of the `document` environment, each with where
  it starts and the parser's state there that crosses nodes: the units spent by failed `$` scans
  (`MATH_BUDGET`), the `nextAt` memo and the raw environments' `\end` index (rebuilt for the new
  text). On a splice it parses again from the child that holds the edit, until a child boundary
  after the edit equals an old one moved by the edit's length with the same state, and answers
  (first child, last child, the shift, the new children as numbers); otherwise a full parse. An
  edit in the preamble, a change of the user signatures, or a group left open by the edit gives a
  full parse.
- **JavaScript.** The model's fast path takes the new children directly. The full tree for other
  readers (`parsedText`, `parseCached`) is made on demand from the old objects: the ones before the
  edit as they are, the ones after it copied with their offsets moved (`shiftNodes` on a copy, never
  on the objects the last model holds).
- **Oracle.** Random edit streams (test/incremental.test.mjs's 5600 edits over 9 documents; with
  the corpus 11,680 over 724): after every edit the incremental tree equals `parseJS` of the whole
  text, in C++ and in the JavaScript reference, and the model equals the full build; planted edits:
  an unclosed `{`, a `\verb` across the edit, `\begin{verbatim}` with no end, the `$` budget at its
  bound, a `\newcommand` after the edit, CRLF.
- **Benchmark.** The fast path's keystroke: bench_native.mjs and `dev/bench_native_page.py
  --cpu 6 --width 390`.
- **Gain** (estimated from the parts above): a keystroke's model 1.8 to about 0.5 ms on the paper,
  7.2 to about 1.5 ms on the generated document; at a phone's speed about 6 times those amounts
  per keystroke (8 and 30 ms).
- **Size.** About 6 KB. **Risks.** The hardest batch to get right: state that crosses nodes, and
  stale offsets in the lazily made tree (the offset guard of incremental.test.mjs must cover
  it). Memory: two texts and a tree per file in the core; dropped on a project switch.

### B3. The model's text runs

- **Files.** New `tex/native/core/text.cc`, `unitables.h`, `dev/unitables.mjs`; src/model.js
  `Builder.text` (3096), `Acc` (3710), `countWords` (1871), `trimInl` (3732).
- **C++.** For a text node (file, range), the characters the page shows (spaces folded, `--` and
  `---`, TeX's quotes, `?``, `!``, German shorthands where the language is German, surrogate
  pairs) with each character's source range, read from the text the core holds; and the words of
  the run as `countWords`'s pattern counts them. `Acc` keeps the pieces and makes a seg's `t` and
  `map` once at `flush`, not a character at a time. `map` stays a JavaScript array (from the Int32
  view), so the model's JSON is byte for byte the same; making it an Int32Array everywhere (render.js
  681 already copies it into one) is a separate later step with every reader of `.map` checked
  (model.js, render.js, wordast.js, wordsync.js, spell/words.js, cmd/review.js). Text under a
  macro's position map (`ctx.pm`) stays JavaScript.
- **Oracle.** Every model of the repository and the corpus with the text runs on and off:
  `modelText` equal, word counts equal; the incremental streams; a fuzz of `text()` alone.
- **Gain.** Of a 25 ms full build after B0, `text`, `trimInl`, `countWords` and their patterns are
  about 10 ms, `inl` 3.5, and most of the collector's 18 %: estimated 19 to 13 ms on the paper at
  a desktop's speed, and a first load's model faster in proportion.
- **Size.** About 12 KB of code and 10 KB of Unicode tables. **Risks.** One Unicode version for
  every browser (above); the order of keys in each seg.

### B4. Diff and three way merge

- **Files.** New `tex/native/core/diff.cc`; src/diff.js (all of it), src/share.js `merge3` and
  `clash`, src/wordsync.js `alignRuns`, `textHunks` where they diff.
- **C++.** Lines and words cut as diff.js cuts them, each hashed; Myers on the hashes with
  equality checked, `MAXD` (1500) and the whole replacement past it, the same choice on every tie
  as `myers` and `backtrack`; hunks as offsets. Both texts are usually versions the core holds.
- **Oracle.** Random pairs from edits of every repository and corpus document (1 to 2000 edits a
  side), shuffled lines, a rewrite of 160,000 tokens (the stack overflow task 52 found), past
  `MAXD`, CRLF, an empty side; `merge3` on random three way edits with clashes (text and the clean
  flag); test/share and test/review core off and on.
- **Benchmark.** `changes()` with 36 and 443 changes; `merge3` with 1 % of the lines changed on
  each side and the worst case of task 52 (1648 lines a side, 57 ms).
- **Gain.** Estimated 3 times on the diff: Review's 6.6 to about 2 ms; the worst merge 57 to about
  15 ms. Nothing per keystroke (Review's painting is 92 % of its time and stays DOM).
- **Size.** About 8 KB. **Risks.** Ties must break as the JavaScript breaks them, or marks move.

### B5. The bibliography

- **Files.** New `tex/native/core/bib.cc`; src/bib.js `parseBib`, `texToPlain`, `parseNames`,
  `shortAuthors`, `longAuthors`, `entryYear`, `formatEntry`, `splitTop`; parser.js's `CHARS` and
  `ACCENTS` and bib.js's tables sent at load.
- **Oracle.** Every .bib of the repository and the corpus, random bib-like texts (braces, quotes,
  `@string`, `#`, `@comment`, unbalanced entries), random edits: the entries equal in JSON and in
  insertion order, `formatEntry`'s runs equal for every entry; test/bib core off and on.
- **Gain.** With B0's cache it runs only when a .bib changes: a 2 MB .bib 46 to about 15 ms, all
  its entries formatted (`\nocite{*}`) 63 to about 15 ms.
- **Size.** About 15 KB. **Risks.** Generated strings come back through the UTF-16 buffer.

### B6. The TeX worker's byte work

- **Files.** New `tex/native/texcore/`, `sh tex/build_tools.sh texcore` making
  `tex/vendor/texcore/rikuy-texcore.wasm`; tex/engine.js `sha256hex`, `packOk`, the synchronous
  `fflate.gunzipSync` calls (163, 295, 696, 1448), `t1xRestore`, `quickHash`, `sameBytes`;
  `tex/build_tree.py tools` puts the module in `dist/tex` under its hash, listed in the index, so
  the worker checks it as it checks the programs; `dev/dist-manifest.txt` gains its line;
  `.github/workflows/vendor.yml`'s matrix gains `texcore`.
- **C.** SHA-256; gzip through libdeflate's decompressor into a buffer of the size the index
  gives; the eexec and charstring ciphers; FNV; a byte compare. The worker instantiates it at
  boot; until it is ready, or if it fails, fflate and the JavaScript SHA run as now.
- **Oracle.** test/engine.test.mjs: SHA-256 against node's crypto and `sha256hex` for every size
  from 0 to 200 bytes, the block bounds and 10 MB of random bytes; gunzip against fflate on every
  pack of `dist/tex` where it exists (309 packs, 305 MB) and on cut, corrupted and lying gzip
  streams (the same failure, "does not unpack"); `t1xRestore` against the JavaScript on every Type
  1 font of the tree; then `npm run test:engines` (44), test/preamble.py and `dev/bench_same.py`
  (the same PDFs, pages, text and problems).
- **Benchmark.** 4 MB synthetic (gunzip 64 ms, SHA-256 68 ms here); `dev/bench_compile.py`'s first
  compile with a new count of the bytes unpacked synchronously (most packs arrive through
  `DecompressionStream`, which stays; fonts found in the middle of a run do not).
- **Gain.** Estimated 4 to 5 times on those steps: tens to a few hundred ms of a document's first
  PDF, nothing on later ones.
- **Size.** About 25 KB in `dist/tex` and the artifact. **Risks.** `dist/tex` is reproducible by
  manifest: one more file and the index change; TeX can ask for a pack before the module is
  ready (the fallback covers it).

### B7. Zip and XML: Word files and projects

- **Files.** New `tex/native/core/zip.cc` and `xml.cc`; src/docx.js `unzip`, `badZip64`, `zip`,
  `parseXml`, `serialize`, `extract`'s walk; src/wordjobs.js (callers); src/app.js's project .zip
  import (4124) and export (4524), which load JSZip from cdn.jsdelivr.net today.
- **C++.** The zip container (central directory, `LIMITS` checked from the declared sizes before
  anything is inflated, the ZIP64 check, CRC-32) with inflating and deflating by the browser's
  `DecompressionStream` and `CompressionStream('deflate-raw')`, so the page module carries no
  inflater; the XML reader with its refusal of a DTD and its depth cap, elements as numbers.
- **Oracle.** test/word.test.mjs core off and on (with the real pandoc); every fixture's
  `extract` equal; hostile zips (a bomb by declared sizes, the ZIP64 trick of GHSA-px8p-9vwx-vf98,
  a DTD, 401 levels) refused with the same words; project zips read the same as JSZip reads them.
- **Gain.** Small in speed (a 10 MB `document.xml` est. 3 to 5 times faster to read); one zip
  reader for the page and the Word worker, and no third party script fetched while running.
- **Size.** About 15 KB in the page module; the Word worker is not in the artifact. **Risks.**
  `unzip` becomes asynchronous (its callers change); its messages are a person's to read.

### B8. The small pure functions

problems.js `findProblems`; tex.js `parseTeXLog`; siunitx.js; fences.js `fenceSource`, `unfence`,
`findPairs`; scripts.js `scriptsIn`, `scriptNeeds`, `scriptSetup`, `rtlDocument`; wordbidi.js's
runs (the bidirectional classes from `unitables.h`); spell/words.js `wordsIn`; layout.js
`Layout.plan` (its measured heights in as arrays) and `hfRuns`; `hashText` and `textSig`. Each is
microseconds to a few milliseconds, off the keystroke path or after a pause; a crossing costs
about what C++ saves. Ported for completeness, each kept only under the rule of section 1, each
with its module's tests core off and on and a fuzz of its own. `findProblems` (7.1 ms after every
pause on the paper) is the one with a gain: estimated to about 2 ms. About 25 KB in all.

### B9. The edits on strings (optional, hosted only)

About 12,000 lines: table.js, lists.js, charfmt.js, parasrc.js, pagesrc.js, styles.js, looks.js,
refsrc.js, preamble.js, wrap.js, blockenv.js, outline.js, picture.js, drawing.js's reader,
props.js, cover.js, quickparts.js, forms.js, fields.js, autocorrect.js. Each runs once per click
on bounded text in under a millisecond, and is written as hundreds of regular expressions that a
port must turn into hand written scanners. No person would notice the gain; the size (est. 200 to
400 KB) does not fit the artifact, whose copy would run the JavaScript. If Pedro wants it after
B0 to B8: one module per batch, table.js first (its corpus test puts every table back byte for
byte, the best oracle), then lists.js, pagesrc.js, charfmt.js, parasrc.js and the rest; each
module's `*.test.mjs` core off and on, and a fuzz of its readers. The readers the model calls on
every full build (`listSetup`, `formatOf`, `numText`, `bulletGlyph`, `readHeadLooks`,
`startsectionShapes`, `refsSetup`, `readPage`, `thmMakersIn`, `readEnvBegin`) go first, as B10's
groundwork.

### B10. The Builder in C++ (decide after B3)

model.js's `Builder` (623 to 3657, about 3,000 lines), with its tables from the JavaScript, the
model read back into the same objects field for field (a `readModel`, as `readTree`), held by
`modelText` equality on the corpus and the incremental streams. It needs B1, B5, B8 and B9's
readers first. Gain: after B0 to B3 the Builder's own JavaScript is an estimated 8 to 10 ms of a
full build on the paper and nothing of the fast path; reading the model back costs about a
millisecond (`readTree` reads 104,566 numbers in 0.78 ms). Risk: the highest of the plan. model.js
is the file every UI batch edits; a C++ twin doubles every future change of what the page shows.
Do not start while the UI work goes on; decide with a profile after B3.

### B11. Line breaking and the page's layout (research)

Layout measures every item in the DOM: 5.8 ms of a keystroke on the paper, 87 % of a first load
of the 401 KB document (task 52). Knuth and Plass in C++ over the page fonts' widths (the Computer
Modern Unicode cuts of `build/fonts/`), TeX's hyphenation patterns from the tree and each
formula's KaTeX box measured once would give TeX's own line cuts and spare that measuring. That is
a new layout engine and a change to how render.js draws lines, not a port: prototype it on plain
paragraphs, measured against TeX's PDF (its lines through pdftotext) and the browser's lines,
before deciding.

## 6. Size budget

- The page module is 60,669 bytes today (13.7 KB with Brotli). The claude.ai artifact is about
  255.7 of its 256 MB (PLAN.md task 16, after the arXiv corpus's packages): about 300 KB free.
- Estimated additions: B1 8 KB, B2 6, B3 22, B4 8, B5 15, B7 15, B8 25: the page module about
  160 KB (about 40 KB with Brotli); B6 25 KB in `dist/tex`. B1 to B8 add about 125 KB to the
  artifact: it fits, with little left.
- Each batch reports its bytes in its commit and in PLAN.md and picks its flags by section 4.
  If the artifact runs out of room, its build leaves a module out and runs the JavaScript (the
  core is optional by design); the TeX tree is never cut for it. B9 to B11 are hosted only.
  `tex/publish_batches.py` asserts exactly one core file today: B6 changes it.

## 7. What stays JavaScript, and why

- **Everything that touches the page.** render.js, layout.js's measuring and drawing, editor.js's
  caret mapping, app.js, nav.js, review.js's painting, collab.js, the ribbon, `ui/*`, the methods
  of `cmd/*`, paste.js (it reads the clipboard's HTML through the DOM), pdfview.js, widget.js's
  frames, tour.js. WebAssembly cannot reach the DOM; every step would cross back.
- **Glue around the browser's own services.** store.js (IndexedDB), pwa.js and sw.js (the
  installed app), tex.js (the worker's messages), the spell and Word workers' messaging, git.js
  and gitauth.js, share.js's links (CompressionStream is the browser's own zlib).
- **What the engine already runs as native code.** find.js's searches: V8 compiles a regular
  expression to machine code, Word's wildcards become one, and a C++ engine would have to match
  JavaScript's semantics exactly to be no faster. TextEncoder, TextDecoder, DecompressionStream,
  crypto.subtle.
- **Third party JavaScript with no C or C++ equal that fits.** KaTeX (the page's math), MathLive
  (the equation field), pdf.js (PDFium compiled is about 5 MB, with no room in the artifact, and
  pdf.js draws with the browser's canvas), CodeMirror 5 (the source pane is DOM), isomorphic-git and
  lightning-fs (libgit2 compiled is possible, about 1 MB, hosted only; git is rare: marginal).
  fflate and JSZip leave in B6 and B7, fflate staying as the worker's fallback.
- **graph.js's formula language.** It runs inside each graph's sandboxed frame from the graph
  file's own text, which Rikuy writes into the person's project (and their git): a module would
  have to sit inside every such file. Sampling 2,000 points takes 0.13 ms.
- **What reads or writes JavaScript objects for another JavaScript program.** wordast.js (the
  model into pandoc's JSON, while pandoc takes seconds), wordjobs.js, minimal.js (asks KaTeX about
  every candidate), wordmath.js (MathLive's API), commands.js and keys.js (the registry and the
  chord table), spell/words.js (0.2 ms after a keystroke; Hunspell is already C++).
- **The TeX worker's loop.** engine.js's compile loop, shell.js and tools.js drive programs that
  are already C through Emscripten's file system, which is JavaScript.
- **The JavaScript of every ported function**, as the fallback and the reference.

## 8. Decisions (2026-11-20)

Decided by the coordinator from Pedro's standing wish ("everything possible in C or C++, even
where the gain is small"):

1. **The bar** for keeping a port is section 1's: identical results everywhere (the oracle),
   never slower once every crossing is counted, within its size budget. ARCHITECTURE section 17's
   "at least twice as fast" goes when B1 lands.
2. **B0 goes first, in JavaScript**: the comment scans read once per text, the parsed .bib cached,
   the undo record from the edits.
3. **B9 yes, hosted only**: the claude.ai copy leaves those modules out and runs the JavaScript.
   **B10 after B3**, and only if its oracle is identical. **B11** starts as a separate prototype
   on plain paragraphs before anything is decided about it.
4. **The claude.ai copy's last 300 KB** go first to what runs per keystroke: B1, B2, B3. Later
   batches take what is left, else that copy runs their JavaScript.
