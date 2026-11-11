# Working on Rikuy: a guide for coding agents

Rikuy is a LaTeX editor in the browser: you type on the typeset page and edits patch the
`.tex` source; real TeX Live 2026, compiled to WebAssembly, runs in a Web Worker to make the
PDF. Read this file first, then `docs/ARCHITECTURE.md` for how the parts fit, and the table at
the top of `PLAN.md` for where the project stands. Everything below was true when written; if
a command fails, trust the code and fix this file.

## Map

| path | what is there |
|---|---|
| `src/` | the editor. `app.js` is the entry; `model.js` maps source to page, `parser.js`, `render.js`, `editor.js`, `minimal.js` (smallest source patch), `siunitx.js`, `wordmath.js`; `share.js` (links, comments in the source, the three way merge) and `collab.js` (their UI); `widget.js` (live figures from `rikuy.sty`); `scripts.js` (Chinese, Japanese, Korean, Arabic, Hebrew, Thai, Sinhala and India's nine scripts: which of them a document's text is in, what its preamble sets up, the lines that set them up, which way a document and a language run); `layout.js` (pages and line cuts), `paste.js`, `diff.js` and `fences.js` (history's differences), `bib.js` (references), `problems.js` (TeX's log as a list), `pdfview.js` (the PDF pane), `tex.js` (the TeX worker's client), `store.js` (projects in the browser's storage), `git.js`, `gitauth.js` and `git-shim.js` (git in the page), `sample.js` (the opening document, built in); `ribbon.js` (the row of style, formatting, insert and download buttons under the bar); `pwa.js` and `sw.js` (the installed app: its service worker, updates, offline copy); Word: `word.js` (its UI and the worker's client), `wordast.js` (the page as pandoc's AST), `wordsync.js` (a coauthor's edits back into the source), `wordbidi.js` (which way text runs, for Word), and in the Word worker `wordworker.js`, `wordjobs.js`, `docx.js`, `pandoc.js` |
| `tex/engine.js` | the TeX worker: compile loop, passes, bibtex/biber/makeindex/xindy between them |
| `tex/shell.js`, `tex/tools.js` | the shell TeX's `\write18` and pipes reach, and the programs behind it (Ghostscript, gnuplot, Python, dvips, asy, xindy) |
| `tex/build_tree.py` | the TeX tree and its packs (`dist/tex/`) |
| `tex/build_tools.sh`, `tex/native/` | programs built here with Emscripten 3.1.6, and Rikuy's patches to them; output in `tex/vendor/` (committed) |
| `tex/fetch_inputs.sh` | lays out the build inputs (`$RIKUY_WORK`, default `/tmp/eng`), every download checked by hash |
| `build.mjs` | bundles the page and copies the worker into `dist/`; writes `dist/index.html` (the page as a whole document, for any static server), `dist/LICENSES.txt` and, unless `RIKUY_NO_WORD` is set, `dist/word/` (the Word worker and pandoc in hashed parts) |
| `build/app.mjs`, `build/icons/` | the installed app's part of the build (all but the artifact's, which sets `RIKUY_SHARE`): `lib/`, icons, manifest, the version and `sw.js`, and what crawlers and AI agents read (`robots.txt`, `sitemap.xml`, `llms.txt`, the head's link tags); the icons and `make.py`, which draws them |
| `build/fonts/` | the page's text fonts, cut from the Computer Modern Unicode fonts by `subset.py` (OFL); the interface's IBM Plex (Latin and Latin Extended cuts) comes unchanged from npm's `@fontsource` packages (`build.mjs`) |
| `test/` | node unit tests (`*.test.mjs`) and Playwright browser tests (`*.py`) |
| `dev/` | the comparison harness: one compile, one shell command, the corpus, PDFs against a desktop TeX Live, Asymptote against a desktop asy; and its results (`*.jsonl`); `sandbox.sh`, which runs the arXiv corpus's compiles as a user with no sudo, no network and nothing writable but its own folders (`sandbox_check.py` checks that from inside) |
| `inputs/` | build inputs that took an engine run to make (formats, PK fonts, caches) |
| `sample/` | the document the page opens with (built into the page); `sample/widget/`, a document with a live figure and `rikuy.sty` |
| `docs/ARCHITECTURE.md` | how the editor, the worker, the programs and the tree fit, with the functions to start at |
| `docs/HOSTING.md` | the hosted Rikuy on Cloudflare Pages: what the maintainer sets up once, what the workflows do, rolling back, which browsers do what |
| `PLAN.md` | status, numbers, finished and open tasks, and the rules for commits |
| `CONTRIBUTING.md`, `SECURITY.md`, `docs/REVIEW_PROCESS.md` | how to send a change, how to report a hole, and the review every change that is not small goes through (a written plan, a fresh reader restating it, hostile reviewers, verdicts in the commit message) |
| `SOURCES.md`, `NOTICE`, `LICENSES/` | where every shipped part's source is, its license, and the license texts not elsewhere in the repository |
| `.github/` | CI (`npm test`, the corpus model run, the editor in Chromium, actionlint), `tex.yml` (on every push to `main`: builds `dist/tex` from the pinned inputs or takes it from the cache when they are unchanged, checks the manifest, runs `test/engines.py`, `test/pdf.py` and the offline compile, keeps `dist/` as a workflow artifact), `deploy.yml` (deploys that `dist/` to Cloudflare Pages once the TeX run passed; `docs/HOSTING.md`), `vendor.yml` (rebuilds each program in `tex/vendor/` from an empty `RIKUY_SRC` and fails unless every file has the committed SHA-256), the arXiv corpus workflow, issue and pull request templates |
| `.claude/skills/security-audit/` | Cloudflare's security audit skill (MIT, source commit in `UPSTREAM`); Claude Code and OpenCode load it from here, other agents read its `SKILL.md` |

`dist/` and `node_modules/` are not in git.

## Setup

- node 22, then `npm ci`
- Python 3 with `pip install lz4 playwright numpy pypdf python-docx` (CI pins `playwright==1.56.0`; the arXiv corpus workflow installs `dev/arxiv-requirements.txt`, pinned by hash; where the system Python refuses pip, as Ubuntu 24.04's does, first `python3 -m venv .venv && . .venv/bin/activate`), then `python3 -m playwright install chromium` (the scripts use `/opt/pw-browsers` instead when that folder exists); `poppler-utils` for the comparisons
- a C compiler, so `tex/build_tree.py` can build `tex/native/t1crypt.so` on first use (without one it still works, many times slower)
- for `tex/build_tools.sh`: Ubuntu's `emscripten` 3.1.6 package and node; `git`, `curl`, `make`, `pkg-config`, `xz`, `bzip2`, `dpkg-deb`; for Mesa `meson`, `ninja`, `bison`, `flex` and Python's `mako`; for the native ECL that builds xindy's `gcc` with `libgmp-dev` and `libgc-dev` (the script's header has the list)
- for comparisons with a desktop: `dev/fetch_tl26.sh` (about 6 GB into `/opt/tl26`, or the folder `TL26` names) and `xvfb`

## Commands

| to | run | takes |
|---|---|---|
| unit tests (editor model, the set up of Chinese, Japanese, Korean, Arabic, Hebrew, Thai, Sinhala and India's nine scripts, the commands that turn text and the characters of several code points (`test/scripts.test.mjs`), minimal patch, siunitx, share links and merge, Word export and import with the real pandoc (`test/word.test.mjs`), git tokens per host (`test/gitauth.test.mjs`), the worker's pack hashes, path guard and offline plan (`test/engine.test.mjs`), xindy, unpacking arXiv sources (`test/arxiv_unpack.py`) and merging the shards' rows (`test/arxiv_collect.py`), Cloudflare Pages' limits and the hosted headers (`test/deploy_check.py`)) | `npm test` | 1 min |
| the model on the 716 document corpus | `npm run test:corpus -- <LaTeX-examples clone at 8bfd313b8d98>` | 2 min |
| build the inputs, then the TeX tree and packs | `tex/fetch_inputs.sh`, then `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs` | about 3 GB of downloads |
| build the page into `dist/` | `npm run build`; the editor and its browser tests need nothing more, the PDF pane and the TeX tests need `dist/tex/` from the step above | 10 s |
| serve `dist/` as the artifact host does | `npm run serve` (port 8790) | |
| engines and shell escape in the page | `npm run test:engines` (40 checks) | 9 min |
| typing on the page | `npm run test:browser` | 20 s (80 s on a busy machine) |
| Rikuy as an AI agent meets it: `window.rikuy.api`, every control found by role and name at two widths, `#tex=` links, what llms.txt promises | `npm run test:agent` (116 checks with `dist/tex`, 115 without) | 1 min |
| the installed app: offline, updates, one version at a time, none in the artifact build (and a compile offline where `dist/tex` exists) | `npm run test:offline` | 1 min |
| opening `.tex`, `.bib` and `.zip` with the installed app (`launchQueue`), and files shared to it | `cd test && python3 launch.py` | 20 s |
| serve `dist/` as Cloudflare Pages serves the hosted app (`index.html` as the page, `_headers`) | `npm run serve:app` (port 8791) | |
| check a built `dist/` against Cloudflare Pages' limits (deploy.yml runs it) | `python3 dev/pages_check.py dist` | 1 s |
| lint the workflows | `actionlint` (CI: `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12`) | 2 s |
| one feature in the page (projects, files, git, history, paste, PDF, math field, Word style math, equation extras, sharing and comments, stress, live figures, the ribbon, the scripts beyond Latin (direction, fonts, editing, the set up notice), Word files) | `cd test && python3 features.py` (or `files.py`, `git.py`, `history.py`, `paste.py`, `pdf.py`, `mathfield.py`, `wordmath.py`, `eqextras.py`, `frontier.py`, `share.py`, `stress.py`, `widgets.py`, `ribbon.py`, `scripts.py`, `word.py`); each says what it checks at the top | under a minute each; `word.py` 2 min (with LibreOffice and `libreoffice-math` installed it also edits in LibreOffice) |
| build the page without Word, as for the claude.ai copy | `RIKUY_NO_WORD=1 npm run build` | 5 s |
| random keystrokes on real documents, then every scripted edit on the corpus | `python3 test/corpus_browser.py <corpus>`, then `CORPUS_REPO=<corpus> python3 test/editor_corpus.py out.jsonl` | 1 min; 1 hour (40 min of edits, 20 of compiles) |
| compile one folder | `RIKUY_DIST=dist python3 dev/texrun.py DIR main.tex auto 300` | |
| run one program through the shell | `python3 dev/shellrun.py DIR asy asy -f pdf fig.asy` | |
| rebuild a program | `RIKUY_SRC=/tmp/src sh tex/build_tools.sh asy` (also `dvips`, `xindy`, `gnuplot`, `mesa`) | asy 10 min |
| refresh the tools in `dist/tex` after a program changed | `python3 tex/build_tree.py tools && npm run build` | 1 min |
| remake the page's fonts | `python3 build/fonts/subset.py` (fontTools) | 10 s |
| the corpus, and its PDFs against the desktop | `PLAN.md`, Building | 100 min |

## Where things go

- A new unit test: a `test/<name>.test.mjs` file, added to the `test` chain in `package.json`, or a case in the file that already covers the module. A new browser test: a `test/<name>.py` in the style of `test/browser.py` (its helpers `open_page`, `load_doc`, `click_text`, `src`, `check`), named in the Commands table above and, if CI should run it, in `.github/workflows/ci.yml` (no TeX) or `tex.yml` (needs `dist/tex`).
- A TeX tree without the 3 GB of downloads: every TeX run on `main` keeps its `dist/` as a workflow artifact. `gh run download $(gh run list --workflow tex.yml --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId') --name rikuy-dist --dir dist` gives a full `dist/` with `dist/tex/`; `npm run build` then replaces the page in it and leaves `dist/tex/` alone.
- What an agent using Rikuy (not changing it) reads: `llms.txt` and `llms-full.txt` on the site, written by `llms()` in `build/app.mjs`; the scripting surface is `window.rikuy.api` (`src/app.js`), and `test/agent.py` checks that an agent finds every control by its name.
- What ships and deploys: a merge to `main` runs `tex.yml`, and `deploy.yml` puts that run's `dist/` on Cloudflare Pages (`docs/HOSTING.md`). Nothing else publishes.

## Checking a change

Pick the checks by what you touched, and run them before you call it done:

- `src/`: `npm test`, `npm run test:browser`, `npm run test:agent` for any control, dialog, name or `build/app.mjs`'s guides (an agent finds controls by the names listed in `llms.txt`: renaming one is a change to a public interface), and `npm run test:corpus` for anything in the model or parser; `test/scripts.py` for direction, the page's fonts or `scripts.js`; `npm run test:offline` and `test/launch.py` for `pwa.js`, `sw.js`, `tex.js` or `build/app.mjs`
- `tex/engine.js`, `shell.js`, `tools.js`: `npm run test:engines`; for a fix found on a document, compile it with `dev/texrun.py` before and after
- the tree or packs: `cd dist/tex && find . -type f | sort | xargs sha256sum | diff ../../dev/dist-manifest.txt -`; any difference must be one you meant
- a program in `tex/vendor/`: rebuild it from an empty `RIKUY_SRC` (any folder: the builds map their paths away) and compare the hash with the committed file (`vendor.yml` does this on a runner for every pull request that touches `tex/vendor/`, `tex/native/` or `tex/build_tools.sh`); then `dev/asycompare.py` (Asymptote) or `tex/native/xindy/test.cjs` (xindy)
- `.github/workflows/`: `actionlint`; `build/app.mjs`'s headers: `python3 test/deploy_check.py`
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
  That build is also the only one without the installed app (service worker, manifest, `lib/`).
- The browser tests that wrap `rikuy.html` (`browser.py`, `serve.py`) never start the installed
  app: it starts only in a document with `<meta name="rikuy-app">`, which only `index.html` has.
  `test/offline.py` and `test/pages.py` test it. A service worker answers the requests of the pages
  it controls; a test that changes what a server returns must go through it (or a new context).
- The page runs under a strict Content Security Policy (`connect-src 'self'`, see `test/serve.py`): the worker can fetch only files next to the page.
- This machine's Python may be linked with zlib-ng, whose gzip bytes differ from stock zlib's: packs
  built with it get other names than `dev/dist-manifest.txt` has. To make the manifest here, run
  `build_tree.py` with Ubuntu 24.04's `libz.so.1.3` in `LD_PRELOAD` (CI's Python uses that one).
- The packs for scripts other than Latin (`x` in the index: Chinese, Japanese, Korean, Arabic, Hebrew, India's, Thai, Sinhala) are not in the artifact: build and test them on
  the hosted build; `tex/README.md` says what they hold.
- The published artifact may hold 256 MB; `PLAN.md` gives the current size. It has no room for
  pandoc: build that copy with `RIKUY_NO_WORD=1` (and `RIKUY_WORD_HOST` naming a copy with Word).
- `test/fixtures/word-fixture.docx`, `word-rich.docx`, `word-chinese.docx`, `word-arabic.docx`,
  `word-mixed.docx`, `word-hindi.docx`, `word-indic.docx`, `word-japanese.docx`,
  `word-korean.docx`, `word-hebrew.docx` and `word-scripts.docx` are `test/word_fixture.py`'s
  output (`python3 word_fixture.py out.docx`, and with `rich`, `chinese`, `arabic`, `mixed`,
  `hindi`, `indic`, `japanese`, `korean`, `hebrew` or `scripts` after it), kept so `npm test`
  needs no Python packages; write them again after changing the script.
- LibreOffice without its Math module (`libreoffice-math`) drops every equation of a .docx it
  saves; `word.py`'s LibreOffice checks need it.
- The build machine has two cores: corpus runs use a 240 s limit per document and must run alone.
