# Sources of what Rikuy ships

Rikuy is AGPL-3.0-or-later (`LICENSE`); what it ships keeps its own license (`NOTICE`, with the
texts in `LICENSES/` and the notices of the libraries compiled into each program in
`LICENSES/third-party/`). This file says where the exact source of every compiled part is, so
anyone can rebuild it or check it. Every download in the build scripts is pinned by hash; the
hashes below are the same.

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

BusyTeX's engine binary is then patched in two places by `tex/patch_wasm.py` (`tex/README.md`
says what and why); the rest is shipped as the release has it.

| part | version | binary from | source | license |
|---|---|---|---|---|
| BusyTeX (pdfTeX, XeTeX, LuaHBTeX, bibtex8, makeindex, xdvipdfmx, biber) | 1.4.0 | [release assets](https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.0), SHA-256 `1caa434fb5aab5bdd59dc303bca2ac7b9b9af02ef1627bf8652caabfa1b7cd2b` (`tex/fetch_inputs.sh`) | [TeXlyre/texlyre-busytex-build](https://github.com/TeXlyre/texlyre-busytex-build) at `46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86`, with the inputs below; the JavaScript runner [TeXlyre/texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex) at the tag `assets-v1.4.0` (`1d9ba827ad0da2c85d05da2ada26a4debf6df81e`) | AGPL-3.0 (TeX Live parts GPL, LGPL, MIT; `LICENSES/third-party/busytex.txt`) |
| Ghostscript 10.06.0 | `@okathira/ghostpdl-wasm` 1.1.0 (npm, `package-lock.json`) | npm | [okathira/ghostpdl-wasm](https://github.com/okathira/ghostpdl-wasm) at the tag `v1.1.0` (`a62b7d686b21cf88f6425b3e989d1062b9af4256`), GhostPDL as its submodule (`2d6e764c1f4a73520ed6de6dd3fa78ad30cd6a63`) | AGPL-3.0-or-later |
| Pyodide (CPython 3.14.2) | 314.0.7 (npm) | npm | [pyodide/pyodide](https://github.com/pyodide/pyodide) at the tag `314.0.7` (`b1e4fcc2488962f6360a97f19b9982d6fdb5d16f`) | MPL-2.0; CPython PSF-2.0 |
| Pygments, latexminted, latexrestricted, latex2pydata | the wheels TeX Live's minted bundles (`tex/vendor/wheels/` when the tree is not TeX Live first) | TeX Live, PyPI | PyPI | BSD-2-Clause, LPPL-1.3c |
| the editor's libraries (CodeMirror, KaTeX, MathLive, pdf.js, JSZip, fflate, isomorphic-git) | `package-lock.json` | npm | their repositories | MIT, Apache-2.0, BSD, ISC; KaTeX's fonts OFL-1.1 |
| Paper Modern (the page's text fonts) | Computer Modern Unicode 0.7.0, from npm's `computer-modern` 0.1.3 | `build/fonts/`, cut by `build/fonts/subset.py` | [CTAN cm-unicode](https://ctan.org/pkg/cm-unicode) | OFL-1.1 (`build/fonts/OFL.txt`) |
| IBM Plex Sans 3.201 (400, 500, 600) and IBM Plex Mono 2.3 (400, 500), the interface's fonts | `@fontsource/ibm-plex-sans` 5.3.0 and `@fontsource/ibm-plex-mono` 5.3.0 (npm, `package-lock.json`): Google Fonts' Latin cut, the `*-latin-*-normal.woff2` files, unchanged | npm | [IBM/plex](https://github.com/IBM/plex), as Google Fonts builds it ([google/fonts](https://github.com/google/fonts), `ofl/ibmplexsans`, `ofl/ibmplexmono`) | OFL-1.1 (each package's `LICENSE`, in `dist/LICENSES.txt`) |

BusyTeX's `busytex.wasm` and `biber.wasm` are byte for byte those of the release
`build_wasm_46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86_31802832436_1` of texlyre-busytex-build
(compared by SHA-256), which its workflow `build-wasm.yml` built from that commit with Emscripten
5.0.4. That build downloads its inputs without pinning them: TeX Live's source at the branch
`tags/texlive-2026.0` of [TeX-Live/texlive-source](https://github.com/TeX-Live/texlive-source)
(commit `f26cc5ed05a1f784d1e694fe5b9cfc3ce992c03d`), expat 2.5.0 (libexpat's release `R_2_5_0`) and
fontconfig 2.13.96 (a release asset of texlyre-busytex-build); for biber, Perl 5.38.2, biber 2.22,
the CPAN modules of `biber/modules.txt`, libxml2 2.9.14, sombok and emperl5
(`biber/fetch_sources.sh`); its TeX tree comes from the TeX Live 2026 DVD image. The notices of the
libraries compiled into these programs are in `LICENSES/third-party/`.

The sources that live only on other people's GitHub are attached to the release
`sources-2026-10-28` too, made by `git archive` (for ghostpdl-wasm, the repository and its
submodule's tree in one archive) or as downloaded:

| file | what | SHA-256 |
|---|---|---|
| `texlyre-busytex-build-46ebb62.tar.xz` | TeXlyre/texlyre-busytex-build at `46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86` | `27c0d4f2999d8411c6b8a749a44cc70745f33f3f9da512d2281386ac33893423` |
| `texlyre-busytex-1d9ba82.tar.xz` | TeXlyre/texlyre-busytex at `1d9ba827ad0da2c85d05da2ada26a4debf6df81e` | `93b757e028f390af700d9d2c7fc6fea0a8f8fa7cd4c7b4634e4b8f0efec89e5c` |
| `ghostpdl-wasm-a62b7d6.tar.xz` | okathira/ghostpdl-wasm at `a62b7d686b21cf88f6425b3e989d1062b9af4256`, with ArtifexSoftware/ghostpdl at `2d6e764c1f4a73520ed6de6dd3fa78ad30cd6a63` in `ghostpdl/` | `883a7c83f73a6e1f62db7053cded9c66b47d8001704ac19362f3af12ceb1bc06` |
| `fontconfig-2.13.96.tar.gz` | the release asset `fontconfig-2.13.96` of texlyre-busytex-build | `dbabc038d41cfc3f14da1b173ae103ba7cc678efb17e091b9e801c6286b3f684` |
| `expat-2.5.0.tar.gz` | libexpat's release `R_2_5_0` | `6b902ab103843592be5e99504f846ec109c1abb692e85347587f237a4ffa1033` |

## The TeX tree

TeX Live 2026.20260711 from Ubuntu 26.10's packages (44 of them, each pinned by SHA-512 in
`tex/fetch_inputs.sh`), laid over the tree in BusyTeX's release. A TeX tree is mostly its own
source (macros, font metrics, PostScript and OpenType fonts under their licenses). Ubuntu's
source packages for them are `texlive-base`, `texlive-extra`, `texlive-lang` and the font
packages that `tex/fetch_inputs.sh` names. The formats, PK fonts and caches Rikuy's own
engines made from that tree are in `inputs/generated*.tar.gz` (`tex/build_all.sh` remakes them).
