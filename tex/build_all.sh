#!/bin/sh
# The whole TeX side of Galley, from BusyTeX's release and the Ubuntu TeX Live packages to
# dist/tex (see README.md). OUT defaults to dist/tex; the page itself comes from build.mjs.
# Honors GALLEY_WORK (default /tmp/eng).
set -e
cd "$(dirname "$0")"
WORK=${GALLEY_WORK:-/tmp/eng}
OUT=${GALLEY_TEX_OUT:-$(pwd)/../dist/tex}
DIST=$(dirname "$OUT")
export GALLEY_TEX_OUT="$OUT"
export GALLEY_WORK="$WORK"
[ -f "$WORK/extra/texlive/icudt78l.dat" ] || ./build_icu.sh
python3 build_tree.py tree
python3 build_tree.py packs
(cd .. && GALLEY_OUT="$DIST" node build.mjs > /dev/null)
# caches that need the engine itself: fontconfig's (XeTeX), luaotfload's (LuaTeX)
python3 build_fccache.py "$DIST"
python3 build_luacache.py "$DIST"
python3 build_tree.py tree
python3 build_tree.py packs
(cd .. && GALLEY_OUT="$DIST" node build.mjs > /dev/null)
du -sh "$DIST"
