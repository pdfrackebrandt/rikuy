# Sources of what Rikuy ships

Rikuy is AGPL-3.0-or-later (`LICENSE`); what it ships keeps its own license (`NOTICE`). This
file says where the exact source of every compiled part is, so anyone can rebuild it or check
it. Every download in the build scripts is pinned by hash; the hashes below are the same.

## Compiled here (`tex/vendor/`, by `tex/build_tools.sh`)

dvips, Asymptote and xindy are built from TeX Live's own source tree; gnuplot and the libraries
from Ubuntu's source packages. An empty `RIKUY_SRC`, in any folder, rebuilds every committed
program byte for byte (PLAN.md, task 21).

| part | version | source | license |
|---|---|---|---|
| dvips, kpathsea, zlib | TeX Live 2026 | [TeX-Live/texlive-source](https://github.com/TeX-Live/texlive-source) at `f6b450440fca5d39f069f1d43153f7a8a75b04a1` (`texk/`, `libs/zlib`) | GPL-2.0-or-later, LGPL-2.1-or-later, zlib |
| Asymptote | 3.09 | same commit, `utils/asymptote` (with its bundled GLEW) | GPL-3.0-or-later |
| xindy | 2.5.1 | same commit, `utils/xindy` | GPL-2.0-or-later |
| GLM | 1.0.1 | [g-truc/glm](https://github.com/g-truc/glm) at `0af55ccecd98d4e5a8d1fad7de25ba429d60e863` | MIT |

From Ubuntu's archive (`https://archive.ubuntu.com/ubuntu/pool/` plus the path), checked by
SHA-256. The same files are attached to this repository's release `sources-2026-10-28`,
with two archives of the git sources above made by `git archive`:
`texlive-source-f6b4504-galley-subset.tar.xz` (the directories of that commit the build uses;
SHA-256 `b9b09589078c539aa663d3e60a08045d1a4e0370f6417d17c96d0e61b02a4887`) and `glm-1.0.1.tar.xz`
(`ce6ab133e2650843cc8341eb7325b111471da44978babe89641c4e4b5a420cac`).

| file | SHA-256 | license |
|---|---|---|
| `main/m/mesa/mesa_24.0.5.orig.tar.gz` | `5fd81faf83923fbd5c860c77f9709f82c8e9bb8b91cb4c972ce8b64ec1006b67` | MIT (core) |
| `universe/g/gsl/gsl_2.8+dfsg.orig.tar.gz` | `69614b7005133a2d3a75827044164de98670568382e3192888a3185578451a70` | GPL-3.0-or-later |
| `main/f/fftw3/fftw3_3.3.11.orig.tar.gz` | `5630c24cdeb33b131612f7eb4b1a9934234754f9f388ff8617458d0be6f239a1` | GPL-2.0-or-later |
| `universe/e/eigen3/eigen3_3.4.0.orig.tar.bz2` | `b4c198460eba6f28d34894e3a5710998818515104d6e74e5cc331ce31e46e626` | MPL-2.0 |
| `universe/g/gnuplot/gnuplot_6.0.2+dfsg1.orig.tar.xz` | `c02de00f808fd0911b68050b9ce4a4d9f2901aeca6fda66a2f41bfde650fabc2` | gnuplot license |
| `universe/e/ecl/ecl_24.5.10.20250914.git294da20+dfsg.orig.tar.xz` | `6a06bbd5248ba9128b84b7a25833f9db7f6df0ad3795b63574c328192755b6c4` | LGPL-2.1-or-later |
| `main/g/gmp/gmp_6.3.0+dfsg.orig.tar.xz` | `bd2966e6d277f79328e894a5a9f3ba3fbf2ed2be81def5f48623e30c23fb1572` | LGPL-3.0-or-later or GPL-2.0-or-later |
| `main/libg/libgc/libgc_8.2.8.orig.tar.gz` | `7649020621cb26325e1fb5c8742590d92fb48ce5c259b502faf7d9fb5dabb160` | MIT style (bdwgc) |
| `universe/x/xindy/xindy-rules_2.5.1.20160104-12build2_all.deb` | `0c9e20debe3f1a5a601025fb70cdccf32c81b07bc28bd41591dc2dcce3986086` | GPL-2.0-or-later |

Rikuy's own changes to them are in `tex/native/` (`patch_asy.py`, `patch_mesa.py`,
`patch_gnuplot.py`, `xindy/patch_xindy.py`, `rpc/`, `galley_main.c`) and the build steps in
`tex/build_tools.sh`. If the archive drops a file: copy it from the release into `$RIKUY_SRC/dl`,
or set `UBUNTU_POOL=https://snapshot.ubuntu.com/ubuntu/20261028T000000Z/pool`.

## Taken as released

| part | version | binary from | source | license |
|---|---|---|---|---|
| BusyTeX (pdfTeX, XeTeX, LuaHBTeX, bibtex8, makeindex, xdvipdfmx, biber) | 1.4.0 | [release assets](https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.0), SHA-256 `1caa434fb5aab5bdd59dc303bca2ac7b9b9af02ef1627bf8652caabfa1b7cd2b` (`tex/fetch_inputs.sh`) | [TeXlyre/texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex) | AGPL-3.0 (TeX Live parts GPL, LGPL, MIT) |
| Ghostscript | `@okathira/ghostpdl-wasm` 1.1.0 (npm, `package-lock.json`) | npm | [okathira/ghostpdl-wasm](https://github.com/okathira/ghostpdl-wasm) | AGPL-3.0-or-later |
| Pyodide (Python 3.14) | 314.0.7 (npm) | npm | [pyodide/pyodide](https://github.com/pyodide/pyodide) | MPL-2.0 |
| Pygments, latexminted, latexrestricted, latex2pydata | the wheels TeX Live's minted bundles (`tex/vendor/wheels/` when the tree is not TeX Live first) | TeX Live, PyPI | PyPI | BSD-2-Clause, LPPL-1.3c |
| the editor's libraries (CodeMirror, KaTeX, MathLive, pdf.js, JSZip, fflate, isomorphic-git) | `package-lock.json` | npm | their repositories | MIT, Apache-2.0, BSD |
| Paper Modern (the page's text fonts) | Computer Modern Unicode 0.7.0, from npm's `computer-modern` 0.1.3 | `build/fonts/`, cut by `build/fonts/subset.py` | [CTAN cm-unicode](https://ctan.org/pkg/cm-unicode) | OFL-1.1 (`build/fonts/OFL.txt`) |

## The TeX tree

TeX Live 2026.20260711 from Ubuntu 26.10's packages (44 of them, each pinned by SHA-512 in
`tex/fetch_inputs.sh`), laid over the tree in BusyTeX's release. A TeX tree is mostly its own
source (macros, font metrics, PostScript and OpenType fonts under their licenses). Ubuntu's
source packages for them are `texlive-base`, `texlive-extra`, `texlive-lang` and the font
packages that `tex/fetch_inputs.sh` names. The formats, PK fonts and caches Rikuy's own
engines made from that tree are in `inputs/generated*.tar.gz` (`tex/build_all.sh` remakes them).
