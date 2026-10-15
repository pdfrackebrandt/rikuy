# Galley

A LaTeX editor in the browser where you type on the typeset page. Edits on the page patch the
`.tex` source, and real TeX Live 2026 (pdfTeX, XeTeX, LuaHBTeX, compiled to WebAssembly) runs in
a Web Worker to make the PDF. Shell escape works: Ghostscript, gnuplot, Python with Pygments,
dvips, Asymptote, xindy, makeindex, bibtex, biber and TeX itself run in the page too.

One self-contained page plus `dist/tex/` (about 250 MB of engine, packs and tools). It is
published as a private claude.ai artifact; any static host works too.

- `src/`: the editor (`app.js` is the entry; `template.html` the page)
- `tex/`: the TeX worker (`engine.js`, `shell.js`, `tools.js`), the tree and pack builder
  (`build_tree.py`), the programs built for it (`build_tools.sh`, `native/`, `vendor/`).
  Details in [tex/README.md](tex/README.md)
- `test/`: Playwright browser tests and node unit tests
- `dev/`: the harness used during development: one compile (`texrun.py`), one shell command
  (`shellrun.py`), the 719 document corpus (`corpus_full.py`, with the last results)
- `inputs/generated.tar.gz`: build inputs that took an engine run to make (ICU subset, font and
  Lua caches, the pdfLaTeX format, the corpus usage profile)

Where the work stands and what is left: [PLAN.md](PLAN.md).
