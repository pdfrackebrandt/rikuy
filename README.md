# Galley

A LaTeX editor in the browser where you type on the typeset page. Edits on the page patch the
`.tex` source, and real TeX Live 2026 (pdfTeX, XeTeX, LuaHBTeX, compiled to WebAssembly) runs in
a Web Worker to make the PDF. Shell escape works: Ghostscript, gnuplot, Python with Pygments,
dvips, Asymptote, xindy, makeindex, bibtex, biber and TeX itself run in the page too. On the
LaTeX-examples corpus 700 of 705 PDFs equal a desktop TeX Live 2026's in pages, text and pixels;
the other five differ on the desktop's side: 3D Asymptote without a display, a font it lists but
cannot load, Debian's own build of a font (PLAN.md, task 2). Scripted edits on the typeset
pages of the same corpus (780 of them: typing, deleting, bold, formulas, table cells, footnotes)
land where they were made and undo byte for byte (task 13).

One self-contained page plus `dist/tex/` (about 250 MB of engine, packs and tools). It is
published as a private claude.ai artifact; any static host works too.

- `src/`: the editor (`app.js` is the entry; `template.html` the page)
- `tex/`: the TeX worker (`engine.js`, `shell.js`, `tools.js`), the tree and pack builder
  (`build_tree.py`), the programs built for it (`build_tools.sh`, `native/`, `vendor/`).
  Details in [tex/README.md](tex/README.md)
- `test/`: Playwright browser tests and node unit tests
- `dev/`: the harness used during development: one compile (`texrun.py`, `profile.py`), one
  shell command (`shellrun.py`), the 719 document corpus (`corpus_full.py`, with the last
  results), the comparison with a desktop TeX Live 2026 (`fetch_tl26.sh`, `tl26.sh`,
  `pdfcompare.py`) and with a desktop Asymptote (`asycompare.py`), the arXiv sample
  (`arxiv_corpus.py`)
- `inputs/generated*.tar.gz`: build inputs that took an engine run to make (ICU subset, PK fonts
  and metrics METAFONT made, font and Lua caches, the three LaTeX formats, the corpus usage
  profile), in three archives under 10 MB

Where the work stands and what is left: [PLAN.md](PLAN.md).

To get a working build on a fresh machine: `tex/fetch_inputs.sh` (sets up `$GALLEY_WORK`),
then the build commands in PLAN.md. CI runs the pure-node tests on push.
