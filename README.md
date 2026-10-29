# Rikuy

*Rikuy* is Quechua for "to see". It is a LaTeX editor in the browser where you type on the
typeset page. Click into a paragraph, a formula, a table cell or a footnote on the rendered page
and edit it there: Rikuy patches the `.tex` source in the smallest way that makes the change,
and undo gives the source back byte for byte. Real TeX Live 2026 (pdfTeX, XeTeX and LuaHBTeX,
compiled to WebAssembly) runs in a Web Worker and makes the PDF. Nothing is installed and there
is no account; documents stay in the browser until you send them, as a share link that carries
the document itself, a file, or a git push.

![Rikuy with its sample document: the typeset page you type on, and the LaTeX source beside it](docs/screenshot.png)

There is no public copy to open yet. To try the editor on your own machine you need node 22 and
Python 3: `npm ci && npm run build && npm run serve`, then open http://127.0.0.1:8790. The PDF
pane also needs the TeX tree, which takes the longer build under [Running it](#running-it).

## What works

- **Typing on the page.** Text, bold and italic, formulas (in a MathLive field, written back
  as LaTeX), table cells, footnotes, `siunitx` quantities. The source pane shows every
  change as it lands.
- **The whole TeX Live 2026 toolchain.** The three engines, latexmk's reruns, bibtex and biber,
  makeindex and xindy, glossaries, and shell escape: Ghostscript, gnuplot, Python with Pygments
  (minted), dvips, Asymptote with 3D rendering, and TeX starting TeX (TikZ externalize,
  `standalone`).
- **Coauthors without accounts.** Share copies a link that opens the document ready to type in;
  the document travels inside the link, nothing is uploaded. (In the copy hosted on claude.ai the
  page cannot read the link it opens with, so the recipient pastes it onto the page once.)
  Coauthors who never write LaTeX type and comment on the page and send a link back; their edits
  arrive as tracked changes, merged with what you wrote meanwhile. Comments are LaTeX comment
  lines, so Overleaf, Git and TeX keep them and print nothing.
- **Overleaf and Git.** An Overleaf project comes in as its source .zip, or through Overleaf's
  Git integration; it leaves with one click to Overleaf, or as a plain .tex (.zip for several
  files). Git: clone, commit, push and pull. A browser reaches a git server only through a CORS
  proxy, which sees your access token: the field starts with isomorphic-git's public proxy, and
  you can put your own there.
- **Projects.** Folders of files, zip import and export, the PDF beside the page with SyncTeX
  both ways.

## How close to a desktop TeX Live

Measured against Ubuntu 26.10's TeX Live 2026 on the 716 documents of the
[LaTeX-examples](https://github.com/MartinThoma/LaTeX-examples) corpus, comparing pages, text
and pixels at 72 dpi: **703 of the 705 documents both compile give equal PDFs** (99.7 %); the
other two differ on the desktop's side (a font it lists but cannot load, Debian's own build of a
font). Of TeX Live's 220 Asymptote examples, 211 give the desktop's asy's PDF or fail the same
way, 7 draw random data on purpose, and 2 differ (one in floating point, one out of memory).
Of 792 scripted edits on the typeset pages of the corpus, 781 land where they were made and 11
open their formula as source by design; all 792 undo exactly. The method, every number and every
mismatch with its cause: [PLAN.md](PLAN.md).

## Running it

Rikuy is one HTML page plus `dist/tex/` (about 250 MB of engines, TeX packs and programs), which
any static web server can serve (`dist/index.html` is the page); the page fetches packs as a
document needs them. It also loads KaTeX, CodeMirror, MathLive, JSZip and pdf.js from jsDelivr
and its interface font from Google Fonts, so it needs a network connection.

```sh
npm ci
tex/fetch_inputs.sh                      # build inputs into $RIKUY_WORK (default /tmp/eng), about 3 GB, every file checked by hash
python3 tex/build_tree.py tree && python3 tex/build_tree.py packs
npm run build                            # the page, into dist/
npm run serve                            # http://127.0.0.1:8790
```

The TeX build has been run on Ubuntu. It needs curl, sha256sum, sha512sum, dpkg-deb, Python 3
with `lz4` and, to run at a usable speed, a C compiler; [AGENTS.md](AGENTS.md) lists the setup
for everything else. The inputs unpack to about 10 GB, so point `RIKUY_WORK` at a disk with room:
`/tmp` is emptied on reboot and is memory on some systems.

To work on the editor alone, `npm ci && npm run build && npm run serve` is enough: the page runs
and its browser tests pass without the TeX tree; only the PDF pane needs it. `npm test` runs the
unit tests; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the editor, the worker and
the TeX tree fit together; [tex/README.md](tex/README.md) covers the worker and the programs.

Rikuy's tests run in Chromium, and that is where it is known to work. The bundle is built for
Chrome 100, Firefox 100 and Safari 15 and later, but nothing tests Firefox or Safari yet; reports
from them are welcome.

## Contributing

Issues and pull requests are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) says how to check a
change. Coding agents: start with [AGENTS.md](AGENTS.md). Security problems go by email or
private report, not in an issue: [SECURITY.md](SECURITY.md).

## License

Rikuy is free software under the GNU Affero General Public License 3.0 or later
([LICENSE](LICENSE)). It ships TeX Live, BusyTeX, Ghostscript, Asymptote, Mesa and other free
software, each under its own license: [NOTICE](NOTICE) lists them, [SOURCES.md](SOURCES.md)
says where the exact source of each is, [LICENSES/](LICENSES) holds the license texts that
are not elsewhere in the repository, and [LICENSES/third-party/](LICENSES/third-party) the notices
of the libraries compiled into each program. `npm run build` puts all of them in
`dist/LICENSES.txt`.
