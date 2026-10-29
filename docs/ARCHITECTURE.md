# Rikuy architecture

Rikuy is one HTML page plus a folder of WebAssembly. The page (`src/`, bundled into
`dist/rikuy.html`) parses the project's `.tex` files, typesets them itself as HTML (KaTeX for
math, Computer Modern fonts cut for the page) and turns every input on that rendering into a
patch of the source. A Web Worker (`tex/engine.js`) runs TeX Live 2026 on the same files for the
PDF pane. The halves share only the project files and SyncTeX; the page you type on is never the
PDF. Paths are from the repository root; `name()` is a function, `Class.method` a method.

```
Page    src/ → dist/rikuy.html
  App.files (Map name → text) ◀───────────────────── CodeMirror pane: App.fromSource()
     │ buildModel()                 src/model.js, src/parser.js
     ▼
  model.blocks: items, segs (a source range per character), atoms, style wrappers
     │ Renderer.sync()              src/render.js (unchanged blocks reused by key)
     ▼
  DOM blocks, registry BLOCKS ── Layout.measure / plan / apply (src/layout.js) ──▶ #pages
  #pages ── beforeinput ──▶ App.onBeforeInput ──▶ edits {f, s, e, t} ── App.commit() ──▶ App.files
          posFromDom(), CaretIndex (src/editor.js)
  App.compilePdf() ──▶ TeXEngine.compile() (src/tex.js) ── postMessage ──▶ worker
  PdfView (src/pdfview.js) ◀── {result: pdf, synctex, log} ◀────────────── worker

Worker  tex/engine.js, tex/shell.js, tex/tools.js → dist/tex/
  compile(): pickEngine → pass() × n → bibtex8 | biber → indexTools → asyFigures → reruns
             → xdvipdfmx | dvips + ps2pdf
     │ \write18, popen/pclose, xdvipdfmx's Ghostscript → shell_escape_dispatch_js
     ▼
  GalleyShell → exec(): built ins | deferred (makeindex, bibtex) | TOOLS[kind].run
  tools.js: gs, gnuplot, python (Pyodide), dvips, asy, xindy, pdfcrop; TeX via nestedTeX()
  MEMFS /texlive ◀── first read ── packs p-*.wasm (sync XHR, IndexedDB) ── index tree.wasm
                 ◀── kpse_remote_fetch_js ── mirror m-*.wasm (self hosted Rikuy only)

Build   tex/fetch_inputs.sh → build_tree.py tree → build_tree.py packs → node build.mjs → dist/
```

| to change | start at |
|---|---|
| how a construct looks on the page | `Builder.flow`, `Builder.cmd`, `Builder.envBlock` (`src/model.js`); `Renderer.item`, `Renderer.inl` |
| what a keystroke writes | `App.onBeforeInput`, `insertText`, `deletionEdits`, `enter`, `toggleStyle` (`src/app.js`); `escapeTeX` |
| undo grouping | `App.record`, `App.undo`, `App.redo` |
| share links, comments, the copy back, Overleaf | `makeShareLink`, `openSharedLink`, `takeBack`, `commentPop`, `openInOverleaf` (`src/collab.js`); `commentEdit`, `merge3` (`src/share.js`) |
| equation editing | `App.openMath`, `attachField`, `toField`, `fromField`; `src/minimal.js`, `wordmath.js`, `fences.js` |
| engine choice, passes, bibliography, indexes | `pickEngine`, `compile`, `runBiber`, `indexTools` (`tex/engine.js`) |
| a shell escape program | `exec` (`tex/shell.js`); `loadTool`, `make*` (`tex/tools.js`) |
| which TeX Live files ship | `build_tree`, `build_packs` (`tex/build_tree.py`) |
| a program compiled for Rikuy | `tex/build_tools.sh`, `tex/native/` |

## 1. Source to page

`App.rebuild(caret)` (`src/app.js`) runs model, render, layout and caret in that order.

- **Parse.** `parse()` (`src/parser.js`) builds a forgiving tree whose nodes keep exact offsets
  (`s`, `e`, inner `is`/`ie`, environment body `be`/`es`). `scanUserSigs()` first reads
  `\newcommand`/`\def` arities from all files and marks environments whose definition opens a
  TikZ picture as raw. See also `SIG`, `MATH_ENVS`, `RAW_ENVS`, `PARSE_CACHE`.
- **Model.** `buildModel({files, main}, prev)` runs `Builder` (`src/model.js`): `preamble()`,
  `preCmd()`, `collectDefs()`, then `flow()` groups nodes into units (paragraph, heading, display
  math, list, theorem, float, table, bibliography) and `inl()`/`cmd()` build inline items;
  `\input` recurses with that file in `ctx.f`. Without `prev` it builds twice so forward
  references resolve; with `prev` once, and again only if `sameRefs()` sees a reference change.
- **Source map.** Text becomes `seg` items `{k: 'seg', f, t, map}`: `Acc.ch()` pushes one
  `[start, end)` source range per character, so “ points back at both characters of ``` `` ```.
  Units on the page (math, citation, reference, footnote, figure, raw block, error chip) are
  atoms with `s`, `e`, `is`, `ie`; style commands are `sty` wrappers. `expandMacro()` expands a
  user macro with a position map `pm`; characters from the macro body get `-1` (read only).
  `test/model.test.mjs` checks every seg map against the source.
- **Render.** `Builder.result()` keys each block by file, source text, `sig` (each resolved value
  it used, via `Builder.use()`) and item types. `Renderer.sync(model, prefix)` keeps each DOM
  block whose `prefix + key` matches, updating only `base` (its source offset), and renders the
  rest (`renderBlock`, `item`, `inl`, `atomEl`; math by `Renderer.katex`). Blocks register
  `segs`, `atoms`, `stys` in `BLOCKS` with offsets relative to `base`; spans carry `data-g`,
  `data-a`, `data-y`, `data-m` as `blockId.index`, so a block that only moved needs no new DOM.
  A new `prefix` (all redrawn) comes when macros or the option signature change.
- **Layout.** `App.layoutPass()`: `Layout.measure` (new items measured once in hidden `#mhost`),
  `Layout.plan` (pure pagination, footnotes, line splits), `Layout.apply` (rewrites only pages
  whose signature changed). Also on this path: `src/bib.js`, `src/siunitx.js`, `src/problems.js`.

## 2. Page to source

`#pages` is contenteditable, but `App.onBeforeInput` calls `preventDefault()` on every input type
except IME composition (`onCompEnd` rebuilds and commits the composed text), so the browser never
changes it. It dispatches to `insertText`, `enter`, `deleteInput`, `toggleStyle`, `undo`, `redo`.

- **Caret to source.** `App.caretNow()` → `posFromDom()` (`src/editor.js`): a text node in
  `span.t` → `segOfSpan()` → `boundary(B, seg, k)` (`B.base` plus the seg map); an atom maps to
  its `s` or `e`. Back: `CaretIndex.find(f, p, bias)` over spans sorted by source start.
  `App.pending` keeps the intended position when the DOM position maps back elsewhere.
- **Edits** are `{f, s, e, t}`. `escapeTeX()` escapes typed text (`%` to `\%`, quotes to ``` `` ```
  and `''`, no break space to `~`); `{}` follows a control word (`endsWithControlWord`).
  `deletionEdits()` deletes a balanced range outright, else only its visible characters
  (`visibleRanges`), so markup survives. `enter` inserts `\n\n`, `\item`, `\\` or `\newline` by
  `data-ctx`, or at an item's end shows a ghost paragraph (`showGhost`, `ghostInsert`).
  `toggleStyle` wraps in `\textbf{…}` or unwraps the enclosing wrapper (`styOfEl`). Backspace
  beside an atom first selects it (`soleAtom`, `arm`). Paste goes through `src/paste.js`.
- **Atoms** open popovers (`onMouseDown` → `openAtom`): `openMath` (MathLive field from
  `attachField`, mirrored by a textarea; `toField`/`fromField` lift `\label`, `\tag` out and back;
  `minimalRow()` writes the smallest change; `faithful()` keeps a formula the field cannot hold as
  source), `openCite`, `openRef`, `openRaw`, all writing through `liveRange()`.
- **`App.commit(edits, caret, kind)`** drops out of range edits, applies each file's edits from the
  end backwards, then `record()`, `rebuild(caret)`, `pushToSource()` (CodeMirror patched with the
  minimal `diff()`, origin `galley`) and `saveSoon()`: `persist()` to IndexedDB (`src/store.js`;
  localStorage fallback) and `noteEdit()`, which schedules `pdfSoon` (1.4 s) and snapshots. The
  CodeMirror pane goes the other way: `srcRebuild` (260 ms) → `fromSource()` → `record` →
  `rebuild`; undo, redo and leaving the pane flush it first.
- **Tabs.** All tabs of a browser share one project record. `persist()` writes one at a time and
  first checks the record's time against `savedT`: what another tab saved since goes into the
  versions (`keepOtherTab`). A tab shown again takes that tab's text as one undo step
  (`adoptOtherTab`), and a tab with nothing unsaved writes nothing when it is hidden or closed.

## 3. Undo and redo

`App.hist` entries are `{kind, files: [{f, s, del, ins}], caretBefore, caretAfter, time, open,
before}`; `record()` stores one splice per file, the common prefix and suffix `diff()` between the
text before the group and after it. The open top entry absorbs the next commit of the same `kind`
within 2 s (`type`, `del`: only with the caret within 2 characters of the last); a popover's
commits share its `session` kind. `undo()` puts `del` back at `s`, moves the entry to `redoStack`
and rebuilds at `caretBefore`; `redo()` reverses it. 400 entries at most; a new one clears redo.
CodeMirror's history is cleared on file switch and its undo keys call `App.undo`.

## 4. Sharing, comments and the copy back

`src/share.js` holds the logic, `src/collab.js` the interface (its methods join `App`'s
prototype).

- **Links.** `makeShareLink(role)` deflates `{name, main, files, base, by, role}`
  (`CompressionStream('deflate-raw')`, base64url) into the fragment `#share=1.…`, which browsers
  never send to a server. For a link to coauthors (`role: 'coauthor'`) the author's browser first
  keeps a named version; `base` is its signature (`textSig`). Figures stay out of the link.
  `shareBase()` is the page's own address, or `RIKUY_SHARE` at build time for a copy inside a
  frame. On start (and on `hashchange`, or a pasted link) `openSharedLink()` drops the fragment
  from the address and opens the document. A page in a frame (the claude.ai artifact) never sees
  the fragment of the outer address, so there the recipient pastes the link onto the page.
  `unpackShare()` treats every field as the sender's: it stops inflating past 32 MB, takes only
  `[name, text]` files whose names `cleanPath()` accepts (nothing outside the project folder,
  no `.git`), and the document must parse; a link opened under the name of a project whose
  figures this browser keeps opens as `Name (Sender)`, so it never takes that project's place.
- **The coauthor** gets the document as a new project (`loadProject`), the version shared as the
  base of the Changes tab, the marks on, the source closed and a bar saying who shared it
  (`guestMode`); `shareCtx` (kept per project in IndexedDB) remembers whom to send it back to.
- **The copy back** (`role: 'back'`) carries the same `base`. In the author's browser `takeBack()`
  finds that version, merges line by line (`merge3`, `mergeProjects`: both sides kept where they
  touch different lines, the coauthor's where they touch the same ones, with a note), applies the
  result as one undo step and sets the author's own text as the base: what Changes lists and
  the page marks are exactly the coauthor's edits.
- **Text from someone else compiles restricted.** A project opened from a link, one a copy came
  back into, one opened from a .zip and one cloned from a git repository are marked
  (`markFromLink`, with where it came from, kept per project as `link:` in IndexedDB) and
  compiles with TeX Live's restricted shell escape until its owner allows more (`allowShellHere`,
  or ticking Shell escape), because shell escape lets a document run programs in the worker. The
  worker that compiled such a document keeps no LuaTeX font cache from it and is let go before it
  compiles anything else (`TeXEngine.compile`, `tainted`), since Lua and the shell's commands can
  write anywhere in its files. And `pygmentize -x`, which would load a lexer from a `.py` file the
  document wrote, is refused for every document.
- **Comments** are lines `% comment (Name) on "words": text` and `% reply (Name): text` under the
  line they are about (`commentEdit`, `findComments`). On a line of its own a comment changes
  nothing TeX typesets (the line above ended in a space, the comment takes its own line end), and
  `commentEdit` refuses verbatim environments and the preamble. `paintComments()` highlights the
  quoted words (`CSS.highlights`) and puts a mark in the page margin; the Comments tab lists the
  threads with Reply and Resolve.
- **Leaving.** Save writes a one file project as its `.tex` and anything larger as a `.zip`
  (`zipBlob`), optionally without the comment lines (`stripComments`); Open in Overleaf posts
  the `.zip` as a data URL to `https://www.overleaf.com/docs` (`snip_uri`, `main_document`,
  `engine`). For Overleaf's Git integration `gitUrlOf()` turns a project's address into
  `https://git.overleaf.com/<id>`, and the user name becomes `git`.

## 5. Page and worker

`TeXEngine` (`src/tex.js`) starts the worker from a blob (so it runs under the page's policy)
that sets `self.__galleyBase` and imports `engine.js`. Its `onmessage` takes `{init, base, mirror,
env}`, `{compile}`, `{prefetch}`, `{exec}` (one program, files read back: build scripts),
`{shell}` (one program through the shell: tests) and sends `{status}`, `{ready}`, `{result}`,
`{execResult}`, `{shellResult}`, `{error}`. `App.compilePdf` sends all project files
(`compileFiles`), the engine choice and the shell escape box; `parseTeXLog()` maps the log to
files and lines; `PdfView.show(pdf, synctex)` draws with PDF.js; past 5 minutes of typesetting,
`stopPdf` ends the worker. `boot()` fetches `tree.wasm`, the mirror index, the engine chunks
`w-*.wasm` and the core packs; `newTeX(true)` makes `MAIN`; `restoreFontCaches()` follows.

## 6. The compile loop: `compile(job)` in `tex/engine.js`

1. **Folder.** `projectDir(job.project)`, stable per project (`touchProject` keeps three); `KEEP`
   files (aux, bbl, toc, idx…) and `ASY_OUT` survive unless `job.clean`.
2. **Engine.** `pickEngine()`: the menu, else `% !TeX program = …`, else packages (LuaTeX ones or
   `\directlua`: lualatex; XeTeX ones, fontspec family, PSTricks: xelatex), else pdflatex.
   `ENGINES` holds the command lines: TeX Live's `-progname`, `-synctex=1`, `-recorder`,
   `-shell-escape` or `-shell-restricted`, the format from `FMT`; xelatex `-no-pdf`, latex DVI.
3. **Prefetch.** Packs that `INDEX.provides` lists for each `\usepackage`, `\documentclass`,
   `\LoadClass` and beamer theme load in parallel (mirror ones too). `preloadTools()` loads
   programs the source suggests (gs, gnuplot, Python for minted, xindy, a second TeX).
4. **Before pass 1**: the kept `.bcf` is removed (its text saved in `job.lastBcf`), as is a `.bbl`
   of the other bibliography system and the `.aux` family after an engine change (`lastEngine`).
   With no `.aux`, `TRIVIAL_AUX` is written, as latexmk does: a one page document takes one pass.
5. **`pass()`** = `texRun()` (`run(tex)`, then `.log` and `.fls`). While the shell asked for a
   program not loaded (`SHELL.state.need`) it loads it (`loadTool`, `addTeXInstance`) and runs
   again, three rounds at most. Deferred calls run in `runPrograms`. `rewrote()` (a file read,
   then written with other content, per the recorder) and minted's `SHELL.state.rerun` set
   `pendingRerun`.
6. **Bibliography**, when the `.aux` has `\bibdata` or biblatex data and the `.bib` signature
   (`job.bibSig`, `bibSigs`), the citations (`citesIn`) or, for biber, the `.bcf` changed, or no
   `.bbl` exists: `runBiber()` (BusyTeX's Perl biber, a fresh module, `.bbl` copied back) for a
   biber `.bcf`, else `bibtex8 --8bit`. Then a pass.
7. **`indexTools()`**: makeindex for `.idx`, commands imakeidx names in the log, nomencl's `.nlo`,
   each glossary the `.aux` declares (xindy via `glossaryXindy` for an `.xdy` style, retried as
   makeglossaries does), each only when its input's hash changed (`indexSigs`). Then a pass.
8. **`asyFigures()`**: each `<job>-N.asy` whose hash changed is drawn by `asyRun()`. Then a pass.
9. **Reruns** while `needsRerun(log)` (LaTeX's rerun messages, not biblatex asking for biber) or
   `pendingRerun`, up to five TeX passes; indexes are checked after each.
10. **Driver**: `.xdv` → `xdvipdfmx`; `.dvi` → `dvips`, then `ps2pdf` via `SHELL.dispatch`. The
    result holds `pdf` (null when empty), `synctex`, `log`, `runs`, `passes`, `missing`, `packs`.

## 7. Shell escape: finding and running programs

`newTeX()` sets `imports.env.shell_escape_dispatch_js(a, b)`: `SHELL.dispatch(cmd, cwd)` for
`b >= 0`, else `pipeHook()`, which serves the `popen`/`pclose` bodies `tex/patch_wasm.py` writes
into the BusyTeX binary (`-1` read pipe: run now, hand back a file of its output; `-2` write pipe;
`-3` register the FILE; `-4` close: run a write pipe on what was written). patch_wasm.py also
routes xdvipdfmx's fork and execvp of Ghostscript to this call.

`GalleyShell` (`tex/shell.js`): `tokenize()` and `runLine()` handle quotes, `&&`, `||`, `;`,
pipes, redirections, `VAR=value`, `sh -c`. `exec(argv, io)` picks by basename: built ins in
JavaScript (echo, cat, cp, rm, test, `kpsewhich` over the project folder then `treeLookup`…);
`DEFER` (makeindex; bibtex as bibtex8) queued for after the pass; `GS`, `PY`, `BUILT` (dvips,
pdfcrop, asy), `XINDY`, `TEXES`, gnuplot via `tool(kind)` → `ctx.tools[kind].run(argv, io, h)`
(not loaded: kind added to `S.need`, exit 1); anything else to `S.missing`, exit 127. Callers use
`dispatch` (TeX), `run` (argv as given: asy's `System()`), `pipe`, `capture` (Python's kpsewhich).

`loadTool(k)` (`tools.js`) fills `TOOLS` with `makeGs`, `makeGnuplot`, `makePython`, `makeDvips`,
`makeAsy` or `makeXindy`, fetching the `t-*.wasm` assets `INDEX.tools` names. `tex` is
`nestedTeX()`: TeX started from TeX runs on the instance one level down (`texPool`, three at most,
made outside TeX runs by `addTeXInstance`) with Rikuy's format, progname and shell mode.
`pdfcrop` is JavaScript: Ghostscript's bbox device, then pdfTeX. Asymptote keeps a LaTeX open for
label sizes; `native/patch_asy.py` makes that pipe `Module.galleyPipe` → `pipeProgram()`, which
reruns TeX on all written so far (`texPipe`, `pipeSessions`; `pipeCache` keeps TeX answers only).
`asyRun()` first runs up to three rehearsals (`asyRehearsal`: questions noted, sizes guessed,
nothing drawn), each answered in one TeX run (`asyAnswerAll`), then runs asy for real.

## 8. File systems shared between programs

- `MAIN.FS`, the first TeX instance's MEMFS, holds the tree at `/texlive` and the projects at
  `/home/web_user/project`. Tree nodes carry `TREE_MTIME`, so build time fontconfig caches hold.
- Other TeX instances, dvips, asy and xindy mount `/texlive` and `/home/web_user` of `MAIN.FS`
  through `proxyFS()` (`mountTeX`) and use TeX's files directly; `flushProxyCache()` runs before
  each run; `/tmp` stays theirs. `runGalleyTool` puts an empty file at the program's path
  (`/texlive/bin/dvips`), where kpathsea starts looking for `texmf.cnf`.
- Ghostscript, gnuplot and Python have their own file systems. gs copies inputs in at the same
  absolute paths (`mirrorIn`) and outputs back (`texWrite`); gnuplot and Python copy the project
  folder in (`mirrorFolder`) and copy back what changed or vanished (`copyBackChanged`). Copies
  are dated 0, so an equal size rewrite within a millisecond still counts. biber gets copies.

## 9. Programs built for Rikuy, and their memory

`tex/build_tools.sh` compiles dvips, Asymptote (with GLM, Mesa's OSMesa, GSL, FFTW, Eigen), xindy
(ECL, GMP, Boehm GC) and gnuplot with Ubuntu's Emscripten 3.1.6 into the committed `tex/vendor/`.
Each `main` is compiled as `real_main` (`-Dmain=real_main`) and entered through `galley_main(argc,
argv)` (`tex/native/galley_main.c`; `galley_main_cxx.cc` for asy; for xindy `native/xindy/main.c`,
choosing tex2xindy or xindy by `argv[0]`), because that toolchain exports no `main(int, char **)`.
The links (`LINK`; xindy has its own flags) make MODULARIZE factories `GalleyDvips`, `GalleyAsy`,
`GalleyGnuplot`, `GalleyXindy` exporting `_galley_main`, `_malloc`, `_fflush` (and `_xindy_boot`).

`emProgram()` (`tools.js`): with `_galley_main`, `enter` mallocs the whole argv (name first) into
the heap and calls it, then `_fflush(0)`; without (npm's Ghostscript), `callMain(argv.slice(1))`.
After `init` (xindy: `_xindy_boot` loads the Lisp kernel) it snapshots all memory and the stack
pointer; each `call()` resets the stack pointer, runs, closes descriptors left open and copies the
snapshot back, zeroing growth. Why: the programs expect a fresh process per run (globals, leaks,
exits from deep inside), so each run starts as a new process would; xindy's snapshot stands in for
CLISP's `xindy.mem`. The stack pointer is a global outside memory; `callMain` leaves argv on it and
exits from deep inside leave it lower: unreset, Ghostscript's 64 KB stack hit its heap after about
25 asy runs. Memory never shrinks: a tool left above 1 GiB (`TOOL_MEM_LIMIT`) is dropped.

TeX does likewise in `newTeX()` and `run()`: after warm runs the first 64 MiB (`MEM_HEADER`) are
kept and restored after every run, the rest zeroed, the stack reset to `_sp0`, descriptors above 2
closed; that also frees strings the worker mallocs into TeX's heap. asy's fork to render a 3D
bitmap becomes `galley_fork_save` (memory below `sbrk(0)`), render, `galley_fork_restore`.

## 10. The TeX tree, packs, lazy loading, mirror

`build_tree.py tree` (`build_tree`) assembles `$RIKUY_WORK/rikuy-tree` from BusyTeX's release
tree (`tree-extra`, via `unpack_busytex.py`) and Ubuntu 26.10's TeX Live 2026.20260711 packages
(`CORE_SETS`, `DEB_SETS`, `FONT_PICKS` from `texlive-fonts-extra`), which win for shared files
while `RIKUY_TL_FIRST=1` (default); `protected()` keeps BusyTeX's `web2c`, `texmf-var`,
`texmf-config`, `tex/generic/config`; `EXCLUDE` and `DROP` filter. It adds the formats,
`fonts.conf`, the `extra/` overlay (ICU subset, PK fonts, metrics, Lua caches, gnuplot prologues),
asy's base and shaders, xindy's modules, fontconfig caches, trims `pdftex.map` to fonts present
and writes `ls-R` (`write_lsr`). Files reach the tree only this way (PLAN.md, Rules).

`build_tree.py packs` (`build_packs`) writes `dist/tex/`:
- core packs (about 6 MB raw each): `usage.json`'s `core` paths plus the `must` files (`ls-R`,
  `texmf.cnf`, `pdflatex.fmt`, `pdftex.map`…); the rest grouped by package folder (`group_key`)
  into packs up to 3 MB raw, big groups split; each gzip level 9, mtime 0, named `p-<hash>.wasm`;
- `.pfb` fonts with both Type 1 ciphers removed (`t1x`, index kind 1), put back byte for byte by
  the worker's `t1xRestore`; the patched engine in 14 MB chunks `w-*`, biber `b-*`, tools `t-*`;
- every file wrapped by `wasm_wrap()` as an empty WebAssembly module with one custom section
  `galley` (the artifact host serves fixed types only; the worker's `unwrap()` skips the header);
- `tree.wasm`: `{v, wasm, wasmHash, wasmSize, core, packs: [{f, z, n, h}], files: [[path, size,
  pack, offset, zlen?, kind?]], provides, biber, tools}`. Today 238 packs, 2 core, 38,828 files.

`populate()` makes each indexed file a MEMFS node whose `contents` getter, on first read, loads its
pack synchronously (`loadPackSync`: sync XHR, as TeX cannot wait; `fflate.gunzipSync`) and slices
the file out; `usedBytes` answers sizes without loading. Unpacked packs stay in `packs`; compressed
ones go to IndexedDB `galley-tex`/`blobs` (key `p:<hash>`), so a later session needs no network.

`build_tree.py mirror` packs the rest of TeX Live into `$RIKUY_WORK/mirror` (`m-*.wasm`,
`index.wasm` with a complete `pdftex.map`). Given `RIKUY_MIRROR` at build time, or `?texlive=URL` naming one on the page's own site,
the worker loads it (`loadMirror`, `mirrorPopulate`), and BusyTeX's `kpse_remote_fetch_js` calls
`mirrorFetch(name, format)` when kpathsea finds nothing locally (basename plus `KPSE_SUFFIX`, file
written into `MAIN.FS`). A page on claude.ai reaches only its own server: self hosted use only.

## 11. Build pipeline

1. `tex/fetch_inputs.sh` fills `$RIKUY_WORK` (default `/tmp/eng`), hash checked: `busy/busytex`
   (BusyTeX 1.4.0), `tree-extra`, `debs/x/<pkg>`, `mf/x` (METAFONT for `build_pk.py`), and
   `inputs/generated*.tar.gz` (`extra/`, `fccache/`, `fmt/`, `usage.json`, `pdflatex-all.fmt`).
2. `python3 tex/build_tree.py tree`, then `python3 tex/build_tree.py packs` (which runs
   `patch_wasm.py` into `$RIKUY_WORK/busytex-patched.wasm` when that is missing or older).
3. `node build.mjs`: `src/sample.js` from `sample/`; esbuild bundles `src/app.js` (IIFE, minified
   unless `--dev`, `__RIKUY_MIRROR__`) and `src/git.js` as `dist/git.js` (loaded by the Git
   panel); the fonts of `build/fonts` (Paper Modern, cut from the Computer Modern Unicode fonts
   by `build/fonts/subset.py`) and the CSS go into `src/template.html` as `dist/rikuy.html`;
   worker scripts, `busytex.js`, `biber.js`, `fflate.js`, `pyodide.js`, the PDF.js worker and
   vendor tool scripts go to `dist/tex/`, npm's Ghostscript module made a classic script (`self.GalleyGs`; the build
   fails if its stack exports moved), control bytes escaped. `dist/index.html` is the page inside
   the document the artifact host wraps it in, for any static server; `dist/LICENSES.txt` holds
   `NOTICE`, the license texts of what `dist/` ships and the notices of the libraries compiled into
   its programs (`LICENSES/third-party/`). `RIKUY_OUT` moves the output.

KaTeX's JS, CodeMirror, JSZip, MathLive, mhchem and PDF.js load from CDNs at run time (`CDN` in
`src/app.js`), each but PDF.js (a module `import()`, which takes no hash) checked against the
npm file's hash (`SRI`; KaTeX's in `src/template.html`). `tex/build_all.sh` remakes what the engines make for a changed tree (`build_pk.py`;
`build_formats.py`, `build_fccache.py`, `build_luacache.py` drive the worker in Chromium through
`tex-smoke.html`'s `exec`). Also: `swap_wasm.py` (a patched engine into a built `dist/tex`),
`build_tree.py tools` (the programs only), `publish_batches.py` (uploads to the hosted copy).

## 12. Tests and harness

- **Node, in CI** (`.github/workflows/ci.yml`, `npm test`): `test/model.test.mjs` (sample model,
  seg maps checked), `edge.test.mjs` (malformed input must not throw), `fences.test.mjs`,
  `minimal.test.mjs`, `siunitx.test.mjs`, `share.test.mjs`, `tex/native/xindy/test.cjs` (against CLISP), and
  `corpus.test.mjs DIR` (`buildModel` over `MartinThoma/LaTeX-examples` at `8bfd313b8d98`).
- **Playwright** (`cd test && python3 X.py`, on `dist/` or `RIKUY_DIST`; helpers in `browser.py`,
  the CSP server `serve.py`): `browser.py` (typing), `features.py`, `files.py` (zip round trip),
  `git.py`, `history.py`, `paste.py`, `pdf.py` (pdfLaTeX, SyncTeX), `engines.py` (engines, shell
  escape), `mathfield.py`, `wordmath.py`, `eqextras.py`, `frontier.py`, `share.py` (two browsers: share, comment,
  send back, merge), `stress.py`; on a corpus,
  `corpus_browser.py` (random keystrokes) and `editor_corpus.py` (six edits per document land
  where made, undo byte for byte, projects compile). Each says at its top what it checks.
- **dev/** drives the worker through `tex/tex-smoke.html`: `texrun.py`, `shellrun.py`,
  `profile.py`, `corpus_full.py`, `pdfcompare.py` (against a desktop TeX Live 2026 from
  `fetch_tl26.sh`), `asycompare.py`, `arxiv_corpus.py`.

Which check covers which change, and how long each takes: `AGENTS.md`. The numbers: `PLAN.md`.

## 13. Known gaps

- `usage.json`, the list of files in the core packs, comes only in `inputs/generated.tar.gz`.
  It was made from the files a corpus run read (`job.trace` returns them), but the script that
  turned those reads into the list is not in the repository; `build_tree.py` uses the list as
  given.
