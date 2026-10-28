#!/bin/sh
# The whole TeX side of Rikuy, from BusyTeX's release and the Ubuntu TeX Live 2026 packages to
# dist/tex (see README.md), remaking everything the engines themselves make: the formats
# (build_formats.py), METAFONT's PK fonts (build_pk.py), fontconfig's and luaotfload's caches.
# Run it when the tree changes; with the tree as fetch_inputs.sh lays it out, inputs/generated*.tar.gz
# already hold all of these and three commands suffice (PLAN.md, Building).
# OUT defaults to dist/tex; the page itself comes from build.mjs. Honors RIKUY_WORK (default /tmp/eng).
set -e
cd "$(dirname "$0")"
WORK=${RIKUY_WORK:-/tmp/eng}
OUT=${RIKUY_TEX_OUT:-$(pwd)/../dist/tex}
DIST=$(dirname "$OUT")
export RIKUY_TEX_OUT="$OUT"
export RIKUY_WORK="$WORK"
build() {
  python3 build_tree.py tree
  python3 build_tree.py packs
  (cd .. && RIKUY_OUT="$DIST" node build.mjs > /dev/null)
}
[ -f "$WORK/extra/texlive/icudt78l.dat" ] || ./build_icu.sh
# caches made for another tree would be read as valid (directory times are fixed): start without
rm -rf "$WORK/fccache" "$WORK/extra/texlive/texmf-dist/texmf-var/luatex-cache" "$WORK/extra/texlive/texmf-dist/fonts/pk"
mkdir -p "$WORK/fccache"
build
python3 build_pk.py
python3 build_formats.py "$DIST"
build
python3 build_fccache.py "$DIST"
python3 build_luacache.py "$DIST"
build
du -sh "$DIST"
