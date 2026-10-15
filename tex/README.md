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
| gnuplot | gnuplot 6.0 (gnuplot-wasm), with its PostScript prologues |
| latexminted, pygmentize | Python 3.14 (Pyodide) with latexminted 0.6, Pygments 2.20 |
| makeindex, bibtex | TeX Live's own, right after the pass |
| pdflatex, latex, xelatex, lualatex | a second instance of the engine (TikZ externalize, auto-pst-pdf, standalone) |
| pdfcrop | Ghostscript's bounding boxes and pdfcrop's own TeX run, in JavaScript |
| dvips | TeX Live's, built here (`build_tools.sh`) |
| asy | Asymptote 3.09, built here, its labels measured by the second TeX |
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

dvips, Asymptote and xindy are compiled from TeX Live's source (pinned commit) with Ubuntu's
Emscripten 3.1.6. Their `main` is entered through `native/galley_main.c`.

- Asymptote keeps a LaTeX open to measure each label; a browser cannot keep a second program
  waiting for input, so `native/patch_asy.py` makes each answer a run of TeX on what asy wrote so
  far. asy first runs as a rehearsal that notes the labels it will ask about, one TeX run answers
  them all, and the real run finds its answers ready: a graph with axes takes 4 s, not 30.
  Ghostscript, which `texpath` and 3D labels read a page at a time, is run the same way, its
  output handed over one line per read as a live pipe would.
- xindy is Common Lisp. TeX Live runs it on CLISP; here ECL is cross compiled (with GMP and the
  Boehm GC from Ubuntu's sources, and binaryen's spill-pointers pass so the GC sees pointers held
  in WebAssembly locals). `native/xindy/` holds the program, the few CLISP-only spots made
  portable (`patch_xindy.py`), and CLISP's REGEXP module on POSIX regex. It loads xindy once and
  starts every run from that memory, as CLISP starts from `xindy.mem`. Its output matches TeX
  Live's xindy byte for byte on `native/xindy/test.cjs`'s cases. The modules come from Debian's
  xindy-rules (the language modules are generated with CLISP) and sit at TeX Live's place.

Independently of shell escape the worker does what latexmk does: bibtex or biber, makeindex for
indexes, glossaries (xindy for a glossary with an .xdy style, called as makeglossaries calls it)
and nomenclatures, asy for asymptote.sty's figures, and reruns until references settle. When
imakeidx may not run its program itself it names the command in the log; that command runs.

## The tree

- `build_tree.py tree` merges the BusyTeX TeX Live 2026 tree with Ubuntu 24.04's TeX Live 2023
  packages for what it lacks. Files of a name the 2026 tree already has are never added.
  `pdftex.map` keeps only lines whose fonts are present.
- `build_pk.py` makes PK fonts with METAFONT for the families that exist only as METAFONT
  source (Concrete, bbm, blackletter, chess and symbol fonts), as mktexpk would on a desktop.
- `build_tree.py packs` writes `dist/tex/`: packs of whole package folders, the engine, biber, the
  shell's programs, and `tree.wasm`, the index. Type 1 fonts are stored with both of their
  ciphers removed (they compress to half) and put back on read, byte for byte.
- `build_all.sh` runs the whole sequence.

The artifact on claude.ai holds about 245 MB (its limit is 256 MB).

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
TeX Live (inkscape, R, Java's bib2gls) cannot run. Asymptote draws 3D figures as vector graphics:
it is built without OpenGL, so no rendered bitmaps and no interactive WebGL or PRC output.
