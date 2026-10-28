# Real TeX in Galley

The PDF pane runs TeX Live 2026 in the browser: pdfTeX, XeTeX (with xdvipdfmx) and LuaHBTeX,
compiled to WebAssembly by the BusyTeX project (texlyre-busytex 1.4.0), in a Web Worker. The
programs packages run through shell escape run in the browser too.

## Engines

`engine.js` picks the engine per compile: a `% !TeX program = xelatex` line wins, then what the
preamble loads (fontspec, unicode-math, polyglossia: XeLaTeX; luacode, luatexja, `\directlua`:
LuaLaTeX; PSTricks: XeLaTeX, whose xdvipdfmx hands PostScript to Ghostscript), else pdfLaTeX.
The page's menu overrides it per project; it also offers LaTeX (dvips): latex makes a DVI file,
dvips PostScript and Ghostscript the PDF, as `latex && dvips && ps2pdf` does on a desktop.

- XeTeX finds fonts by name through fontconfig. Its caches are made at build time
  (`build_fccache.py` copies them out of the engine's memory after a scan, since the binary
  cannot write them) and stay valid because the worker gives the tree fixed directory times.
  XeTeX also needs ICU data; `build_icu.sh` keeps the 5 MB of TeX Live's 22 MB that it reads.
- LuaTeX's font database (luaotfload) is rebuilt for this tree and its tables for Latin Modern
  are shipped (`build_luacache.py`); tables for other fonts are kept in IndexedDB after first use.

## Shell escape

TeX's `\write18`, LuaTeX's `os.execute` and xdvipdfmx's Ghostscript calls reach `shell.js`,
which understands the shell syntax packages use and runs (`tools.js`):

| asked for | runs |
|---|---|
| kpsewhich, l3sys-query, echo, cat, rm, cp, mv, mkdir, touch, test, which, sh -c | answered in JavaScript |
| repstopdf, epstopdf, gs, rungs, ps2pdf | Ghostscript 10.06 (@okathira/ghostpdl-wasm) |
| gnuplot | gnuplot 6.0.2, built here, with its PostScript prologues |
| latexminted, pygmentize | Python 3.14 (Pyodide) with the wheels TeX Live's minted bundles (latexminted 0.7, Pygments 2.19) |
| makeindex, bibtex | TeX Live's own, right after the pass |
| pdflatex, latex, xelatex, lualatex | a second instance of the engine (TikZ externalize, auto-pst-pdf, standalone) |
| pdfcrop | Ghostscript's bounding boxes and pdfcrop's own TeX run, in JavaScript |
| dvips | TeX Live's, built here (`build_tools.sh`) |
| asy | Asymptote 3.09, built here (with GLM, XDR, GSL, FFTW, Eigen, and OpenGL through Mesa's OSMesa), its labels measured by the second TeX |
| xindy, texindy, tex2xindy | xindy 2.5.1 on ECL 24.5.10, built here, with TeX Live's Perl front ends written in JavaScript |

Pipes work both ways: `\input|"cmd"` reads a program's output and `\openout` to `|"cmd"` feeds one.
Unchecking "Shell escape" gives TeX Live's default, restricted mode (with xindy and texindy added
to its list: here they only read and write the project's files). Programs that cannot run in a
browser (inkscape, R) get exit code 127 and are reported.

`patch_wasm.py` changes two spots of the BusyTeX binary. xdvipdfmx runs Ghostscript through
fork/execvp, which WebAssembly lacks: that call goes to the JavaScript hook TeX's `\write18` uses.
popen() and pclose(), stubs in BusyTeX, get bodies that run the command through the same hook
and hand back a file of its output (or, for a write pipe, run it on what was written at
pclose()). `swap_wasm.py` puts a newly patched engine into a built tree.

### Programs built for Galley (`build_tools.sh`)

dvips, Asymptote and xindy are compiled from TeX Live's source (pinned commit), gnuplot 6.0.2
from Ubuntu's source package, all with Ubuntu's Emscripten 3.1.6. Their `main` is entered
through `native/galley_main.c`.

- Asymptote keeps a LaTeX open to measure each label; a browser cannot keep a second program
  waiting for input, so `native/patch_asy.py` makes each answer a run of TeX on what asy wrote so
  far. asy first runs as a rehearsal that notes the labels it will ask about, one TeX run answers
  them all, and the real run finds its answers ready: a graph with axes takes 4 s, not 30.
  Ghostscript, which `texpath` and 3D labels read a page at a time, is run the same way, its
  output handed over one line per read as a live pipe would.
- asy renders 3D pictures in a PDF as a desktop asy does, as a bitmap, through Mesa 24.0.5's
  OSMesa on softpipe (no JIT, no threads), built by `build_tools.sh mesa` (`native/patch_mesa.py`,
  `native/mesa-cross.ini`). asy forks a child for each picture; without fork it renders in
  place and then puts its memory back as the child's exit would, so every picture starts from
  the same state. Its shaders sit at TeX Live's place, `texmf-dist/asymptote/shaders`.
- xindy is Common Lisp. TeX Live runs it on CLISP; here ECL is cross compiled (with GMP and the
  Boehm GC from Ubuntu's sources, and binaryen's spill-pointers pass so the GC sees pointers held
  in WebAssembly locals). `native/xindy/` holds the program, the few CLISP-only spots made
  portable (`patch_xindy.py`), and CLISP's REGEXP module on POSIX regex. It loads xindy once and
  starts every run from that memory, as CLISP starts from `xindy.mem`. Its output matches TeX
  Live's xindy byte for byte on `native/xindy/test.cjs`'s cases. The modules come from Debian's
  xindy-rules (the language modules are generated with CLISP) and sit at TeX Live's place.

Independently of shell escape the worker does what latexmk does: bibtex or biber, makeindex for
indexes, glossaries (xindy for a glossary with an .xdy style, called as makeglossaries calls it)
and nomenclatures, asy for asymptote.sty's figures, and reruns until references settle: when
LaTeX asks, and, as latexmk decides from TeX's recorder file, when a pass read a file it then
wrote with other content (a table of contents whose page numbers moved; LaTeX itself warns only
about labels). At most five passes. As with latexmk, a first run starts from the `.aux` a one
page document writes, so such a document takes one pass, not two. When imakeidx may not run its program itself it names the
command in the log; that command runs.

## The tree

- `build_tree.py tree` lays TeX Live 2026.20260711 (Ubuntu 26.10's TeX Live packages, the
  `DEB_SETS` collections) over the tree inside BusyTeX's release (TeX Live 2026 of March), so
  packages are July's; BusyTeX's files stay where Debian leaves files out (fonts it packages
  separately, for one) and for the engine's own configuration (`web2c`, `tex/generic/config`).
  `pdftex.map` keeps only lines whose fonts are present. `GALLEY_TL_FIRST=0` gives the earlier
  tree: BusyTeX's, with Ubuntu 24.04's TeX Live 2023 only for what it lacks.
- `build_formats.py` makes the formats (pdfLaTeX, XeLaTeX, LuaLaTeX, every language of
  `language.dat`) with Galley's own engines from that tree, as fmtutil does on a desktop.
- `build_pk.py` makes PK fonts with METAFONT for the families that exist only as METAFONT
  source (Concrete, bbm, blackletter, chess and symbol fonts, bold typewriter), as mktexpk
  would on a desktop, and the EC and Cyrillic (T1, TS1, T2A) metrics TeX Live leaves to
  mktextfm, whose glyphs then come from cm-super.
- `build_tree.py packs` writes `dist/tex/`: packs of whole package folders, the engine, biber, the
  shell's programs, and `tree.wasm`, the index. Type 1 fonts are stored with both of their
  ciphers removed (they compress to half) and put back on read, byte for byte.
- `build_all.sh` runs the whole sequence.

The artifact on claude.ai holds about 250 MB (its limit is 256 MB).

## Full TeX Live for Galley on its own site

`build_tree.py mirror` packs everything the artifact leaves out (all of TeX Live's runtime files:
about 114,000 files, 830 MB in 620 packs) with its own index and TeX Live's whole font map. Host
the folder anywhere that serves files with CORS (GitHub Pages, a bucket) and point Galley at it
with `?texlive=URL`, or build the page with `GALLEY_MIRROR=mirror/`. When kpathsea does not find a
file in the local tree it asks the mirror (BusyTeX's `kpse_remote_fetch_js` hook), so a document
downloads only what it uses. A page on claude.ai can only reach its own server, so the mirror
works on a self-hosted Galley, not inside the artifact.

## Limits

Fonts that come from the mirror are found by file name, not by family name. Programs outside
TeX Live (inkscape, R, Java's bib2gls) cannot run (PLAN.md, task 11). Asymptote renders 3D in
software, two to three times slower than natively (a torus 2 s, the teapot 18 s); WebGL
(`-f html`), V3D and PRC output work too. It runs without its garbage collector, so a run frees
nothing until it ends: a long computation such as TeX Live's `slope.asy` example runs out of
WebAssembly's 2 GB (the collector, tried, did not keep it under that; `build_tools.sh` has the
measurement).
