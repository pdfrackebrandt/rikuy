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
| the installed app: offline copy, updates, "Make available offline" | `install`, `activate`, the `fetch` listener (`src/sw.js`); `registerApp`, `asset`, `keepOffline`, `OFFLINE_FOLDERS` (`src/pwa.js`); `appPage`, `finishApp` (`build/app.mjs`); `keepPlan`, `keep` (`tex/engine.js`) |
| Word (.docx in and out, a coauthor's edits back) | `saveDocx`, `openDocx`, `wordEdits` (`src/word.js`); `buildWordDoc` (`src/wordast.js`); `extract` (`src/docx.js`); `planImport`, `mathPatch` (`src/wordsync.js`); `docxToLatex` (`src/wordjobs.js`) |
| live figures (`\rikuywidget`) | `WidgetLayer`, `widgetDoc`, `WIDGET_CSP` (`src/widget.js`); `Builder.cmd` (kind `widget`), `Renderer.atomEl`; `App.widgetsAllowed`, `widgetResized` |
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
- **Layout.** `App.layoutPass()`: `Layout.measure` (new items measured once in hidden `#mhost`;
  one whose picture had not loaded is measured again when it has: `it.late`, `Layout.invalidate`),
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
- **Git tokens** are kept per remote host (`prefs.gitTokens`, `src/gitauth.js`) and `authFor`
  answers isomorphic-git's `onAuth` only for that host. Every push, pull and clone names its
  address and proxy, so a repository's own `.git/config` (`pushurl`, `http.corsProxy`) cannot
  send it elsewhere. Where a remote came from is kept per repository folder as
  `gitremote:<dir>` (`gitRemoteFrom`): one that came in the `.git` folder of an opened `.zip` or
  folder gets no token filled in until the user sets a remote or a pull or push with a token they
  typed works. A repository from before that record (a clone or an opened `.git`, which cannot
  be told apart) is offered the token as before, with a note to check the host. Tokens are kept
  only after the operation worked; the single token of earlier versions (`prefs.gitToken`) moves
  only to a host that asked for it and took it (`onAuthSuccess`), and is dropped as soon as the
  user replaces it.

## 5. Live figures

`rikuy.sty` (in `sample/widget/`; a document carries a copy beside its main file, so Overleaf
needs no install) defines `\rikuywidget[<options>]{<widget.html>}{<fallback image>}` as
`\includegraphics[#1]{#3}` (graphicx), robust and nothing else: every TeX prints the picture and
never opens the widget. On the page the command is one atom (`Builder.cmd`, kind `widget`) that
runs the widget, a self contained HTML file of the project. `sample/widget/` is a short document
with one (the central limit theorem, an `n` slider) and `make_fallback.py`, which draws its
fallback from the widget's own generator.

- **Files.** `.html` is a text extension (`TEXT_EXT`), so a widget is an ordinary project file:
  in the source pane, share links, Review, merges, git, versions, the .zip and Overleaf, saved
  byte for byte. `widgetPath()` reads its name from the main file's folder, as TeX does. The
  block's key holds the file's signature (`hashText`), so a widget edited in the source pane is
  drawn again and starts from its new text.
- **Where it runs.** The atom renders a box (`.w-live`) as wide as the text; the widget runs in
  an iframe that `WidgetLayer` lays over the box, in `#wlayer`, outside the pages. A frame taken
  out of the document and put back starts from nothing, and the pages move their blocks all the
  time (a block redrawn after its caption is edited, measuring in `#mhost`, pagination); outside
  them the widget keeps its state through typing, undo, zoom and page moves. `place()` runs after
  every layout pass and on any change to the pages (a MutationObserver), pairs frames with boxes
  by file, signature and order, and scales each frame with the page: a widget lays itself out at
  the text width of 100 % zoom and is magnified with the page, as a figure is.
- **Editing.** Clicks inside the widget are the widget's. Its `LaTeX` tab opens the command in
  the source popover as a figure's does (`openRaw`); with Alt it shows the line in the source
  pane; Backspace beside it selects it like any atom, and the frame shows the selection. Typing
  never writes into the command, so the smallest patch and undo work as beside any atom.
- **Height.** The widget sends `parent.postMessage({rikuy: "height", px: N}, "*")`. `onMessage`
  takes it only from the window of one of its own frames (every sandboxed frame's origin is
  `"null"`, so the window is what tells them apart), cuts it to a page's text height, and
  `widgetResized()` sets the box's height and measures its item again; `Layout.invalidate`
  rewrites the item's pages, since measuring takes an item out of its page.
- **Isolation.** `sandbox="allow-scripts"`, without `allow-same-origin`: an opaque origin, so no
  storage, no cookies, no access to the page, the project or other frames, and no popups, forms,
  top navigation or dialogs. The widget arrives as `srcdoc`, behind a head that starts with its
  own policy (`WIDGET_CSP`: `default-src 'none'`; inline script and style; pictures, media and
  fonts as `data:` or `blob:`; no connection, frame, form or `<base>`), turns DNS prefetching
  off and runs `widgetGuard` (below) before any of the widget. The page adds `frame-src 'self'`
  to its host's policy (`framesOnlySrcdoc`, a `<meta>` in the head, which can only narrow it): no
  frame-src refuses a srcdoc frame, and a frame may go nowhere but the page's own site, so a
  widget cannot take its frame to a `data:` or `blob:` document of its own making.
- **Why `srcdoc`.** A `srcdoc` or `blob:` frame inherits the embedding page's Content Security
  Policy, and a policy the widget's document adds can only restrict further. Rikuy's policy, as
  `test/serve.py` serves it (the artifact host's), has `script-src 'self' 'unsafe-inline'
  'unsafe-eval' …`, so inline widget scripts run under it. They always will where Rikuy runs:
  the page's own code is one inline script, so a policy that refused inline scripts would stop
  Rikuy first. `blob:` frames would work as well (with `frame-src blob:`) but add object URLs to
  revoke and nothing else; `data:` frames depend on `frame-src data:` and on URL length; a widget
  served as a file of the page's own site would have to be on the server, and projects live in
  the browser. The page's policy gained only `frame-src 'self'`, which refuses no srcdoc frame.
- **What no policy stops.** Chromium ignores CSP's `webrtc` directive (version 141 calls it
  unrecognized), so a widget can open WebRTC connections: a STUN request to its author's server
  tells them who opened the document, and when, though nothing of the document or the browser.
  So in a project from someone else (a link, a .zip, a git clone: `markFromLink`) each widget
  shows its fallback with a button until the owner runs them (`widgetsAllowed`, `allowWidgets`,
  the `widgets` field of the project's `link:` record, kept apart from shell escape); one's own
  projects run them at once. That click is the control. Behind it, as defense in depth,
  `widgetGuard`, the widget document's first script, deletes every `RTC…` interface from the
  widget's window, so a tracker that calls `RTCPeerConnection` plainly fails, and closes the
  ways around that found by trying: srcdoc frames the widget adds (in its markup, by script, in a
  shadow root it attaches) are taken out before they run, since no policy refuses srcdoc and
  each runs in a window of its own; leaving for a `data:` or `blob:` document (`location`, a
  link, `open(url, '_self')`, a refresh `<meta>`) meets the page's `frame-src 'self'`, since
  `location` cannot be patched and the Navigation API sends an opaque origin no events.
  `document.open()` keeps the window, so nothing comes back; an about:blank frame the widget
  adds has an opaque origin of its own, so `frames[0]` and `contentWindow` are out of reach; a
  Worker has no `RTCPeerConnection`; `open()` is refused by the sandbox. What still gets
  through: a srcdoc frame inside a shadow root the HTML parser makes (`<template
  shadowrootmode>` in the widget's markup, in `document.write` or through `setHTMLUnsafe`),
  which the guard cannot see into. A widget written to get around the guard will; the click
  stays. `test/widgets.py` checks each closed way with a STUN server of its own. A widget's
  script may share the page's thread (not every browser gives sandboxed frames a process of
  their own), so one that loops forever can hang the tab, as a bad web page can.
- **Missing files.** No widget file: the fallback image, as TeX prints it; neither: a quiet
  placeholder naming the path. Problems names a missing widget, and a `\rikuywidget` without
  `\usepackage{rikuy}` and `rikuy.sty` (TeX would stop there). A link carries no figures, so a
  coauthor's PDF gets a gray box for the fallback (`missingFigures`) and their page runs the
  widget, which the link does carry. Printing the page prints the fallback.
- **Size.** Widgets travel in share links as text: five of 65 KB made a link of 174 thousand
  characters (`test/widgets.py`). Nothing is dropped: `unpackShare` refuses more than 32 MB of
  text with a message, and past 2 MiB, more than Chrome opens from its address bar, the link's
  note says to paste it onto the page or send the .zip.

## 6. The installed app (hosted build)

The build without `RIKUY_SHARE` makes `dist/index.html` an installable app: `appPage()`
(`build/app.mjs`) gives it a head with `<meta name="rikuy-app" content="<version>">`, the
manifest (`manifest.webmanifest`: name, standalone, theme colour of the bar, the icons drawn by
`build/icons/make.py`) and KaTeX from `lib/` instead of jsDelivr; `appFiles()` puts the six
libraries the page otherwise takes from jsDelivr into `lib/` (npm's files, refused unless their
SHA-384 is the one the page pins). `rikuy.html`, which a host wraps (the artifact host, the test
servers), is unchanged, and the artifact build (`RIKUY_SHARE` set) compiles `src/pwa.js` out
(`__RIKUY_APP__` false) and builds none of this (`cleanApp`).

- **Version.** `finishApp()` hashes every file of `dist/` but `sw.js`, the TeX packs
  (`tex/[pbtwm]-*.wasm`) and a mirror into the version, stamps it into `index.html` and writes
  `sw.js` as `const RIKUY = {v, files}` (path → SHA-256, size, kind) followed by `src/sw.js`.
  `_headers` is in the version, so a change of policy reaches the kept page too.
- **Service worker** (`src/sw.js`). `install` fetches every file of kind `p` (all the page and
  the TeX worker load, about 7 MB; `l` for any over 4 MiB, fetched on first use) into
  `rikuy-v-<version>`, each checked against its hash (the page by its version tag), so a version
  is kept whole or not at all. `activate` keeps that version and the one before, drops older
  caches and claims the open pages. `fetch` answers the page (navigations to the scope) from the
  cache first, so a new version applies only when its worker is active: when every tab is
  closed, or after "Update ready" (`skipWaiting` on the page's message, then `controllerchange`
  reloads that tab; another tab offers a reload).
- **One version at a time.** A page under a worker asks for its own files as
  `_v/<version>/<path>` (`asset()` in `src/pwa.js`, used for `git.js`, `lib/`, pdf.js and the TeX
  worker's script folder: `TeXEngine`'s `scripts`, which becomes the worker's `HERE`), and the
  worker answers from that version's cache, or 410: a tab left on the old version gets the old
  scripts, never the new ones. The packs keep their plain `tex/` address (`TeXEngine`'s `base`).
- **Packs.** The service worker does not keep TeX packs: the TeX worker keeps them in IndexedDB
  by hash (section 13), and the service worker answers `tex/p-<hash>.wasm` from there when it is
  kept. That is what lets TeX's synchronous XHR (`loadPackSync`) work offline: a blob worker is
  controlled by the page's service worker in Chromium. Keeping them in Cache Storage as well
  would double the largest part of what Rikuy keeps.
- **Make available offline** (`#b-offline`): `TeXEngine.keep(OFFLINE_FOLDERS)` boots the worker
  (which keeps the engine and the core packs, as for a first PDF) and sends `{keep: {folders}}`;
  `keepPlan()` turns the folders into the packs holding their files and `keep()` fetches those not
  kept yet into IndexedDB without unpacking them, sending `{status: 'keep', got, total}`. The
  set is a typical paper under pdfLaTeX: 75 packs, 50 MB (version 29's tree), the engine (12 MB)
  apart. Of cm-super (29 MB) only the upright, bold, italic and typewriter families are in it
  (an entry ending in `*` names a family of a folder's files); its other families and biber are
  left out. The open document is then compiled once (`compileForOffline()`), so every pack it
  reads is kept whether listed or not, and the PDF viewer's scripts with it. A compile reports
  the packs it read (`read`) and, when TeX stopped at a file whose pack could not be loaded,
  the folders (`unkept`) in place of the half written PDF: offline the page names them.
  `test/offline.py` holds the list to the sample: it must read no pack outside the plan.
- **Serving.** `appFiles()` also writes Cloudflare Pages' `_headers` (`headers()`: the policy
  `CSP`, which `test/deploy_check.py` holds to `test/serve.py`'s without outside sources plus
  `frame-ancestors 'none'`; a year's immutable caching for the content addressed files; no-cache
  for the page, `sw.js` and the manifest) and `404.html`, without which Pages answers a missing
  file with the page. `test/pages.py` serves `dist/` the same way for the tests;
  `.github/workflows/deploy.yml` deploys it (`docs/HOSTING.md`).
- **Status bar.** `#st-net` ("Offline", from `online`/`offline` events), `#st-update`,
  `#b-offline`; only in the app build.
- **Opening files with Rikuy.** The manifest's `file_handlers` take `.tex`, `.bib` and `.zip`
  (an Overleaf export) into the window already open (`launch_handler` `focus-existing`: all tabs
  share one project), and `takeLaunches()` hands the files from `launchQueue` to `openFiles()`,
  as the Open button does. Only Chromium browsers on the desktop (Chrome, Edge) honour
  `file_handlers`, and only for the installed app; the OS lists Rikuy under Open with once it is
  installed. No `.rikuy` type: a project is already a `.tex` or a `.zip`, which Overleaf and
  every TeX installation read; a format of Rikuy's own would add nothing they could open.
- **Sharing to Rikuy** (`share_target`, Chrome on Android and ChromeOS): the share sheet posts the
  files to `./share-target`; the service worker keeps them in `rikuy-share` under a random id (at
  most 64 files, 64 MB; a day at most) and opens `./?share-target=<id>`, where `takeShared()`
  takes them and offers them in a toast. Any web page can post that form too, so nothing opens
  without the click, the project opens as someone else's (`markFromLink`, origin `share`: shell
  escape restricted), and `openFiles(list, 'share')` never replaces a file of the open project.
## 7. Word

Word support is optional at build time and lazy at run time. `src/word.js` holds the App methods
(`saveDocx`, `openDocx`, `wordEdits`, `openWordProject`) and `WordEngine`, the page's side of a
worker of its own (`src/wordworker.js`, bundled by `build.mjs` into `dist/word/word.js` and started
from a blob, as the TeX worker is). In the worker, `src/pandoc.js` runs pandoc 3.10 (npm's
`pandoc-wasm` 1.1.0, the pandoc project's WASI build) on an in-memory file system with folders;
`src/wordjobs.js` holds the three jobs (`exportDocx`, `readDocx`, `docxToLatex`), `src/docx.js` the
zip, a small XML reader, Rikuy's custom XML part and `extract()`, and `src/wordsync.js` the
alignment and the import plan. `src/wordast.js` (in the page) walks the model into pandoc's AST.

- **Loading.** Nothing loads with the page. The first Word action starts the worker, which reads
  `word/pandoc.json` (pandoc's version, the SHA-256 of `pandoc.wasm` and of its gzip, and of each
  part), fetches the parts `pandoc-<hash>-<n>.bin` (gzip, 12 MiB each: the host takes no file
  over 25 MiB), checks each part, the joined gzip and the inflated module, and keeps the gzip in
  IndexedDB (`galley-tex`, `blobs`, key `pandoc:<sha256>`), re-hashed whenever it is read back.
  The worker is let go a minute after its last job and stopped if one runs past four minutes.
  `RIKUY_NO_WORD=1` builds leave `dist/word/` out; the Word buttons then say where Word support is
  (`wordMissing`, `RIKUY_WORD_HOST`).
- **Open (`docxToLatex`).** `unzip()` refuses a file over 100 MB, more than 4000 parts or 400 MB
  declared, any part with a DTD, and names that climb out; pandoc reads the zip rebuilt from what
  passed (`docx+citations`, tracked changes accepted) into its JSON, which is cleaned there: links
  only to web or mail addresses, pictures only (renamed `figures/figureN.ext`, 50 MB each),
  tables of short cells as plain `l`/`c`/`r` columns. pandoc writes the LaTeX body; Rikuy writes a
  short preamble with only the packages the body uses, the title block from pandoc's metadata and,
  when the file had Zotero or Mendeley citations, `references.bib` (pandoc's biblatex writer) with
  natbib. The project is marked as someone else's (`markFromLink`, origin `docx`).
- **Save (`buildWordDoc`, `exportDocx`).** The page as the model has it, not the source: headings
  with their numbers, paragraphs, nested lists (`list()` rebuilds them from the model's flat
  items), description lists, theorem heads, tables (a first row set off by a rule is the header),
  captions, footnotes, the title block and abstract (pandoc's metadata), cross references as the
  text the page shows, `\url`/`\href` links, images (a PDF figure as a PNG of its first page drawn
  by pdf.js, `pdfPicture`; EPS and missing files as a bracketed name), live figures as their
  fallback picture, verbatim as code. Equations go in as TeX with the project's macros expanded
  (`expandMath` over `model.mathMacros`) and become Word equations (texmath); texmath drops
  `\tag`, so numbers follow the formula as `\qquad (n)` (`numberRows`). Citations go to pandoc's
  citeproc with the project's `.bib` files: Chicago author-date, or Rikuy's own numeric style when
  the document is numeric, or a `.csl` in the project. What the page cannot draw (TikZ, an
  unknown environment) is a line naming it. Rikuy's comment threads become Word comments on the
  words they quote, replies as further comments.
- **Anchors.** Each paragraph, heading, caption, table cell, description term, footnote and title
  part is a span with an id, which pandoc writes as a bookmark `Rk<n>` inside the paragraph.
  `exportDocx` reads the new file back with `extract()` and lines each block's text up with what
  the walk recorded (`alignRuns`): every character keeps the source range that made it, or is
  generated (`-1`), or belongs to an atom (`-2`: an equation, citation, reference, footnote mark,
  picture). Each equation is read back to TeX by pandoc once (`mathTeX`, one file of all of them,
  `mathDocx`), as `was`. The whole source as exported, the blocks (text and run coded map) and the
  atoms go into `customXml/itemN.xml` as JSON in an element of namespace `urn:rikuy:word:1`, so
  the file alone is enough to bring edits back. LibreOffice 24.2 keeps both the bookmarks and the
  part through open, edit and save (`test/word.py`, `test/word_lo.py`); Word keeps bookmarks and
  custom XML parts by design, but Rikuy has not been run against a real Word here.
- **Edits back (`extract`, `planImport`).** A region runs from one `Rk` bookmark to the next, so
  a paragraph added after a block joins it as `\n\n` (one in a Word list, after a list item, is a
  new `\item`) and a paragraph whose bookmark is gone was deleted; tracked insertions count,
  deletions do not; a deleted paragraph mark joins paragraphs.
  Per block, `textHunks` diffs old and new text by words (changes a word apart are one), trimmed to
  the characters that differ; each hunk goes through the map into an edit of the source as
  exported: a balanced range is spliced, one across markup loses only its visible characters (as
  `deletionEdits` does), and new text is escaped by `escapeTeX`, with paragraphs where the block
  takes them. A whole atom deleted deletes its command; part of one changed (a citation's text, a
  section number) is not applied and becomes a comment. An equation whose TeX differs from `was`
  (spacing, fonts and `\left`/`\right` aside, which LibreOffice rewrites) is patched by
  `mathPatch`: the changed tokens, with context, found in the original source and replaced there,
  else the formula replaced, its `\label`s kept; `safeMath` refuses TeX that would leave math mode.
  Edits are carried onto the source as it is now (`rebase` over `changes(base, now)`); one that
  touches text the owner changed since is not applied and becomes a comment there, quoting the
  coauthor's version. Word comments become Rikuy comments (replies by `commentsExtended.xml`),
  except those already there. Text in a new table row, a moved block and an inserted picture are
  noted as comments, never dropped silently. `wordEdits` applies the result as one undo step and
  sets the text before as the Review base, as `takeBack` does, so each edit can be accepted or
  rejected; the project then compiles with restricted shell escape until its owner allows more.
  A file whose project is not open opens that project (its last version here, else the source the
  file carries) first.

**Whose edits are merged.** The data a .docx carries says where every edit goes in the source,
so it is trusted only when this browser wrote it: the worker returns the SHA-256 of the data at
export (`mark`), the page keeps the marks of its newest 300 exports (`wordRemember`, the
`word-exports` key), and `openDocx` merges edits only from a file whose data hashes to one of
them (`wordKnows`). Any other file with Rikuy data (forged, changed, from another computer or a
cleared browser) opens as a Word file does, as a new project marked as someone else's. The data
holds the main file and the files its blocks come from, not the whole project.

## 8. Page and worker

`TeXEngine` (`src/tex.js`) starts the worker from a blob (so it runs under the page's policy)
that sets `self.__galleyBase` (its `scripts` folder, section 6) and imports `engine.js`. Its `onmessage` takes `{init, base, mirror,
env}`, `{compile}`, `{prefetch}`, `{keep}` (section 6), `{exec}` (one program, files read back: build scripts),
`{shell}` (one program through the shell: tests) and sends `{status}`, `{ready}`, `{result}`,
`{execResult}`, `{shellResult}`, `{error}`. `App.compilePdf` sends all project files
(`compileFiles`), the engine choice and the shell escape box; `parseTeXLog()` maps the log to
files and lines; `PdfView.show(pdf, synctex)` draws with PDF.js; past 5 minutes of typesetting,
`stopPdf` ends the worker. `boot()` fetches `tree.wasm`, the mirror index, the engine chunks
`w-*.wasm` and the core packs; `newTeX(true)` makes `MAIN`; `restoreFontCaches()` follows.

## 9. The compile loop: `compile(job)` in `tex/engine.js`

1. **Folder.** `projectDir(job.project)`, stable per project (`touchProject` keeps three); `KEEP`
   files (aux, bbl, toc, idx…) and `ASY_OUT` survive unless `job.clean`. Every file name and the
   main file pass `projectPath()` first (no `..` segment, no NUL), whatever the page cleaned.
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

## 10. Shell escape: finding and running programs

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

## 11. File systems shared between programs

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

## 12. Programs built for Rikuy, and their memory

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

## 13. The TeX tree, packs, lazy loading, mirror

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
written into `MAIN.FS`). A mirror pack's bytes must hash to the name its index gives it
(`packOk`, `sha256hex`, synchronous because TeX cannot wait) before they are kept as `m:<hash>`,
and again when read back: the cache is the whole site's, so another mirror cannot plant a pack
under a real one's name. A page on claude.ai reaches only its own server: self hosted use only.

## 14. Build pipeline

1. `tex/fetch_inputs.sh` fills `$RIKUY_WORK` (default `/tmp/eng`), hash checked: `busy/busytex`
   (BusyTeX 1.4.0), `tree-extra`, `debs/x/<pkg>`, `mf/x` (METAFONT for `build_pk.py`), and
   `inputs/generated*.tar.gz` (`extra/`, `fccache/`, `fmt/`, `usage.json`, `pdflatex-all.fmt`).
2. `python3 tex/build_tree.py tree`, then `python3 tex/build_tree.py packs` (which runs
   `patch_wasm.py` into `$RIKUY_WORK/busytex-patched.wasm` when that is missing or older).
3. `node build.mjs`: `src/sample.js` from `sample/`; esbuild bundles `src/app.js` (IIFE, minified
   unless `--dev`, `__RIKUY_MIRROR__`) and `src/git.js` as `dist/git.js` (loaded by the Git
   panel); the fonts of `build/fonts` (Paper Modern, cut from the Computer Modern Unicode fonts
   by `build/fonts/subset.py`), the interface's IBM Plex Sans and Mono (Google Fonts' Latin and Latin
   Extended cuts, unchanged, from npm's `@fontsource` packages, each with its unicode-range) and
   the CSS go into `src/template.html` as `dist/rikuy.html`, every font as `data:` (the installed
   app's `index.html` takes the Latin Extended faces from `fonts/<file>-<hash>.woff2` instead);
   worker scripts, `busytex.js`, `biber.js`, `fflate.js`, `pyodide.js`, PDF.js and its worker and
   vendor tool scripts go to `dist/tex/`, npm's Ghostscript module made a classic script (`self.GalleyGs`; the build
   fails if its stack exports moved), control bytes escaped. `dist/index.html` is the page as a
   whole document, for any static server: without `RIKUY_SHARE` the installed app (section 6,
   with `lib/`, `icons/`, `manifest.webmanifest` and, last, `sw.js` and the version), with it the
   page inside the skeleton the artifact host wraps it in; `dist/LICENSES.txt` holds
   `NOTICE`, the license texts of what `dist/` ships and the notices of the libraries compiled into
   its programs (`LICENSES/third-party/`). `RIKUY_OUT` moves the output.
4. Unless `RIKUY_NO_WORD` is set, `build.mjs` also writes `dist/word/`: `word.js` (esbuild's
   bundle of `src/wordworker.js` with fflate and the WASI shim), npm's `pandoc.wasm` gzipped (level
   9) in parts of 12 MiB, and `pandoc.json`, their manifest (section 7). A manifest of the same
   pandoc whose parts are intact is kept, so a rebuild does not gzip again.

In `rikuy.html` (the artifact) KaTeX's JS, CodeMirror, JSZip, MathLive and mhchem load from CDNs
at run time (`CDN` in `src/app.js`), each checked against the npm file's hash (`SRI`; KaTeX's in
`src/template.html`); the installed app loads the same npm files from `lib/`, by the same hashes.
PDF.js is a module `import()`, which takes no hash, so it ships in `dist/tex/` beside its worker. `tex/build_all.sh` remakes what the engines make for a changed tree (`build_pk.py`;
`build_formats.py`, `build_fccache.py`, `build_luacache.py` drive the worker in Chromium through
`tex-smoke.html`'s `exec`). Also: `swap_wasm.py` (a patched engine into a built `dist/tex`),
`build_tree.py tools` (the programs only), `publish_batches.py` (uploads to the hosted copy).

## 15. Tests and harness

- **Node, in CI** (`.github/workflows/ci.yml`, `npm test`): `test/model.test.mjs` (sample model,
  seg maps checked), `edge.test.mjs` (malformed input must not throw), `fences.test.mjs`,
  `minimal.test.mjs`, `siunitx.test.mjs`, `share.test.mjs`, `engine.test.mjs` (the worker's
  pack hashes, path guard and offline plan), `word.test.mjs` (export, read back and import with
  the real pandoc; hostile files), `tex/native/xindy/test.cjs` (against CLISP), and
  `corpus.test.mjs DIR` (`buildModel` over `MartinThoma/LaTeX-examples` at `8bfd313b8d98`).
- **Playwright** (`cd test && python3 X.py`, on `dist/` or `RIKUY_DIST`; helpers in `browser.py`,
  the CSP server `serve.py`): `browser.py` (typing), `features.py`, `files.py` (zip round trip),
  `git.py`, `history.py`, `paste.py`, `pdf.py` (pdfLaTeX, SyncTeX), `word.py` (Word both ways, under
  the host's policy; with LibreOffice installed, an edit made there), `engines.py` (engines, shell
  escape), `mathfield.py`, `wordmath.py`, `eqextras.py`, `frontier.py`, `share.py` (two browsers: share, comment,
  send back, merge), `stress.py`, `widgets.py` (live figures, under the host's policy),
  `offline.py` (the installed app offline and its updates, served by `pages.py` as Cloudflare Pages
  serves it), `launch.py` (files opened with the installed app and shared to it); on a corpus,
  `corpus_browser.py` (random keystrokes) and `editor_corpus.py` (six edits per document land
  where made, undo byte for byte, projects compile). Each says at its top what it checks.
- **dev/** drives the worker through `tex/tex-smoke.html`: `texrun.py`, `shellrun.py`,
  `profile.py`, `corpus_full.py`, `pdfcompare.py` (against a desktop TeX Live 2026 from
  `fetch_tl26.sh`), `asycompare.py`, `arxiv_corpus.py`.

Which check covers which change, and how long each takes: `AGENTS.md`. The numbers: `PLAN.md`.

## 16. Known gaps

- `usage.json`, the list of files in the core packs, comes only in `inputs/generated.tar.gz`.
  It was made from the files a corpus run read (`job.trace` returns them), but the script that
  turned those reads into the list is not in the repository; `build_tree.py` uses the list as
  given.
