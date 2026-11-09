# Working on Rikuy: a guide for coding agents

Rikuy is a LaTeX editor in the browser: you type on the typeset page and edits patch the
`.tex` source; real TeX Live 2026, compiled to WebAssembly, runs in a Web Worker to make the
PDF. Read this file first, then `docs/ARCHITECTURE.md` for how the parts fit, and the table at
the top of `PLAN.md` for where the project stands. Everything below was true when written; if
a command fails, trust the code and fix this file.

## Map

| path | what is there |
|---|---|
| `src/` | the editor. `app.js` is the entry; `model.js` maps source to page, `parser.js`, `render.js`, `editor.js`, `minimal.js` (smallest source patch), `siunitx.js`, `wordmath.js`; `share.js` (links, comments in the source, the three way merge) and `collab.js` (their UI); `widget.js` (live figures from `rikuy.sty`) |
| `tex/engine.js` | the TeX worker: compile loop, passes, bibtex/biber/makeindex/xindy between them |
| `tex/shell.js`, `tex/tools.js` | the shell TeX's `\write18` and pipes reach, and the programs behind it (Ghostscript, gnuplot, Python, dvips, asy, xindy) |
| `tex/build_tree.py` | the TeX tree and its packs (`dist/tex/`) |
| `tex/build_tools.sh`, `tex/native/` | programs built here with Emscripten 3.1.6, and Rikuy's patches to them; output in `tex/vendor/` (committed) |
| `tex/fetch_inputs.sh` | lays out the build inputs (`$RIKUY_WORK`, default `/tmp/eng`), every download checked by hash |
| `build.mjs` | bundles the page and copies the worker into `dist/`; writes `dist/index.html` (the page as a whole document, for any static server) and `dist/LICENSES.txt` |
| `build/fonts/` | the page's text fonts, cut from the Computer Modern Unicode fonts by `subset.py` (OFL) |
| `test/` | node unit tests (`*.test.mjs`) and Playwright browser tests (`*.py`) |
| `dev/` | the comparison harness: one compile, one shell command, the corpus, PDFs against a desktop TeX Live, Asymptote against a desktop asy; and its results (`*.jsonl`) |
| `inputs/` | build inputs that took an engine run to make (formats, PK fonts, caches) |
| `sample/` | the document the page opens with (built into the page); `sample/widget/`, a document with a live figure and `rikuy.sty` |
| `docs/ARCHITECTURE.md` | how the editor, the worker, the programs and the tree fit, with the functions to start at |
| `PLAN.md` | status, numbers, finished and open tasks, and the rules for commits |
| `SOURCES.md`, `NOTICE`, `LICENSES/` | where every shipped part's source is, its license, and the license texts not elsewhere in the repository |
| `.github/` | CI (`npm test`, the corpus model run, the editor in Chromium), `tex.yml` (builds `dist/tex` from the pinned inputs, checks the manifest, runs `test/engines.py` and `test/pdf.py`, keeps `dist/` as a workflow artifact), the arXiv corpus workflow, issue and pull request templates |
| `.claude/skills/security-audit/` | Cloudflare's security audit skill (MIT, source commit in `UPSTREAM`); Claude Code and OpenCode load it from here, other agents read its `SKILL.md` |

`dist/` and `node_modules/` are not in git.

## Setup

- node 22, then `npm ci`
- Python 3 with `pip install lz4 playwright numpy pypdf` (CI pins `playwright==1.56.0`; where the system Python refuses pip, as Ubuntu 24.04's does, first `python3 -m venv .venv && . .venv/bin/activate`), then `python3 -m playwright install chromium` (the scripts use `/opt/pw-browsers` instead when that folder exists); `poppler-utils` for the comparisons
- a C compiler, so `tex/build_tree.py` can build `tex/native/t1crypt.so` on first use (without one it still works, many times slower)
- for `tex/build_tools.sh`: Ubuntu's `emscripten` 3.1.6 package and node; `git`, `curl`, `make`, `pkg-config`, `xz`, `bzip2`, `dpkg-deb`, `npm` (binaryen); for Mesa `meson`, `ninja`, `bison`, `flex` and Python's `mako`; for the native ECL that builds xindy's `gcc` with `libgmp-dev` and `libgc-dev` (the script's header has the list)
- for comparisons with a desktop: `dev/fetch_tl26.sh` (about 6 GB into `/opt/tl26`, or the folder `TL26` names) and `xvfb`

## Commands

| to | run | takes |
|---|---|---|
| unit tests (editor model, minimal patch, siunitx, share links and merge, git tokens per host (`test/gitauth.test.mjs`), the worker's pack hashes and path guard (`test/engine.test.mjs`), xindy) | `npm test` | 1 min |
| the model on the 716 document corpus | `npm run test:corpus -- <LaTeX-examples clone at 8bfd313b8d98>` | 2 min |
| build the inputs, then the TeX tree and packs | `tex/fetch_inputs.sh`, then `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs` | about 3 GB of downloads |
| build the page into `dist/` | `npm run build`; the editor and its browser tests need nothing more, the PDF pane and the TeX tests need `dist/tex/` from the step above | 10 s |
| serve `dist/` as the artifact host does | `npm run serve` (port 8790) | |
| engines and shell escape in the page | `npm run test:engines` (23 checks) | 5 min |
| typing on the page | `npm run test:browser` | 20 s |
| one feature in the page (projects, files, git, history, paste, PDF, math field, Word style math, equation extras, sharing and comments, stress, live figures) | `cd test && python3 features.py` (or `files.py`, `git.py`, `history.py`, `paste.py`, `pdf.py`, `mathfield.py`, `wordmath.py`, `eqextras.py`, `frontier.py`, `share.py`, `stress.py`, `widgets.py`); each says what it checks at the top | under a minute each |
| random keystrokes on real documents, then every scripted edit on the corpus | `python3 test/corpus_browser.py <corpus>`, then `CORPUS_REPO=<corpus> python3 test/editor_corpus.py out.jsonl` | 1 min; 1 hour (40 min of edits, 20 of compiles) |
| compile one folder | `RIKUY_DIST=dist python3 dev/texrun.py DIR main.tex auto 300` | |
| run one program through the shell | `python3 dev/shellrun.py DIR asy asy -f pdf fig.asy` | |
| rebuild a program | `RIKUY_SRC=/tmp/src sh tex/build_tools.sh asy` (also `dvips`, `xindy`, `gnuplot`, `mesa`) | asy 10 min |
| refresh the tools in `dist/tex` after a program changed | `python3 tex/build_tree.py tools && npm run build` | 1 min |
| remake the page's fonts | `python3 build/fonts/subset.py` (fontTools) | 10 s |
| the corpus, and its PDFs against the desktop | `PLAN.md`, Building | 100 min |

## Checking a change

Pick the checks by what you touched, and run them before you call it done:

- `src/`: `npm test`, `npm run test:browser`, and `npm run test:corpus` for anything in the model or parser
- `tex/engine.js`, `shell.js`, `tools.js`: `npm run test:engines`; for a fix found on a document, compile it with `dev/texrun.py` before and after
- the tree or packs: `cd dist/tex && find . -type f | sort | xargs sha256sum | diff ../../dev/dist-manifest.txt -`; any difference must be one you meant
- a program in `tex/vendor/`: rebuild it from an empty `RIKUY_SRC` (any folder: the builds map their paths away) and compare the hash with the committed file; then `dev/asycompare.py` (Asymptote) or `tex/native/xindy/test.cjs` (xindy)
- docs: numbers in `README.md`, `tex/README.md` and `NOTICE` must agree with the table in `PLAN.md`
- anything a document, a share link, an imported project, a remote or a widget from someone else can reach (rendering into the page, the worker's files, git, storage, messages between frames, the shell): run the security audit skill in its quick profile on the files you changed, and fix confirmed findings in the same commit with a test. Its output stays outside the repository (`~/security-audit-skill/rikuy/`) and never goes in git. A scheduled Claude session also audits each week's commits every Sunday (the whole repository on the first Sunday of the month) and opens a fix pull request

## Rules that hold everywhere

- Every download is pinned by hash; a new one gets its hash in the script that fetches it, and a line in `SOURCES.md` if it ships.
- `dist/tex` is reproducible: the same inputs give `dev/dist-manifest.txt` byte for byte. Update the manifest only together with the change that moves it.
- Programs in `tex/vendor/` are build outputs of `tex/build_tools.sh`; never edit or replace them by hand.
- Result files (`dev/*-results.jsonl`) are replaced by a full run, never appended to by hand.
- Commits follow `PLAN.md`'s rules: one commit per finished task, its message saying what changed and the evidence; no status commits.
- Code comments say why, in plain words; keep the style of the file you are in.

## Pitfalls already met

- Rikuy was called Galley at first. Names built into the programs and the packs (`galley_main`,
  `GalleyAsy` and the other factories, the `galley` section of every pack), the keys of what
  browsers keep (`galley.project.v1`, the `galley` and `galley-tex` databases), field names in
  `dev/*-results.jsonl` and the native layer in `tex/native/` keep that name: renaming them would
  change every build output or lose people's documents. Everything else says Rikuy.

- Ubuntu's Emscripten 3.1.6 outputs need `node --no-experimental-fetch` to run under node 22.
- The package is an ES module (`"type": "module"`): to `require()` an Emscripten `.js` from node, copy it to a `.cjs` name or a folder outside the repository first.
- `tex/build_tree.py tools` must run with the same `RIKUY_WORK` the tree was built from; another one changes the Python wheels and so the manifest.
- Programs built for Rikuy are entered through `galley_main` (`tex/native/galley_main.c`) and run many times in one instance: `tools.js` puts their memory back after every run, and lets a program go when a run leaves it above 1 GiB.
- asy runs twice per figure: a rehearsal that only notes the labels it will ask TeX about, then the real run (`tex/README.md`). Anything asy starts fails during the rehearsal on purpose.
- asy has no fork here: it renders 3D pictures in place and then copies its memory back (`tex/native/patch_asy.py`); keep that when touching its rendering.
- The desktop's asy renders 3D through a window: run its comparisons under `xvfb-run -a`.
- The copy the maintainer publishes on claude.ai is built with `RIKUY_SHARE` set to that artifact's address (`https://claude.ai/artifact/W7htGmmfauM4Z3KpjV9vzK`, which opens for others only once it is shared), because a page in a frame cannot see its own address; a copy on your own site needs no `RIKUY_SHARE`. Run the browser tests on a build without it (`test/share.py` expects links to the page itself).
- The page runs under a strict Content Security Policy (`connect-src 'self'`, see `test/serve.py`): the worker can fetch only files next to the page.
- The published artifact may hold 256 MB; `PLAN.md` gives the current size.
- The build machine has two cores: corpus runs use a 240 s limit per document and must run alone.
