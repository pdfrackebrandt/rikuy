#!/bin/sh
# A desktop Asymptote of exactly the version and source Galley's is built from (tex/build_tools.sh:
# TeX Live's utils/asymptote at its pinned commit), compiled natively, with the same features
# switched off and on (no OpenGL, threads, readline, FFTW, GSL, curl or GC; GLM when Galley has
# it; XDR). PLAN tasks 9 and 10 compare Galley's asy with this one.
# Usage: build_asy_native.sh [OUT]   (default $GALLEY_WORK/asy-native; needs $GALLEY_SRC/tl from
#        build_tools.sh, and $GALLEY_SRC/glm when GLM=1)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${GALLEY_SRC:-/tmp/src}
OUT=${1:-${GALLEY_WORK:-/tmp/eng}/asy-native}
B="$OUT/build"
rm -rf "$B" && mkdir -p "$OUT" && cp -r "$SRC/tl/utils/asymptote" "$B"
cd "$B"
touch -d '2000-01-01' configure.ac  # as build_tools.sh: make must not rerun autoconf
# with GLM and without OpenGL, asy needs the two edits Galley's gets for that (patch_asy.py)
[ "${GLM:-0}" = 1 ] && python3 "$HERE/../tex/native/patch_asy.py" . --native
GLMINC=""
[ "${GLM:-0}" = 1 ] && GLMINC="-I$SRC/glm"
# XDR (V3D, xinput/xoutput) as Galley's asy has it: libtirpc's headers from the system
# (libtirpc-dev) or from $TIRPC/include/tirpc with the library in $TIRPC/lib
TIRPC=${TIRPC:-${GALLEY_WORK:-/tmp/eng}/tirpc}
XDRFLAGS="" XDRLIB=""
[ -d "$TIRPC/include/tirpc" ] && XDRFLAGS="-I$TIRPC/include/tirpc" XDRLIB="-L$TIRPC/lib"
./configure --prefix="$OUT/inst" --disable-gc --disable-threads --disable-readline --disable-fftw --disable-gsl --disable-gl \
  --disable-curl --disable-lsp --disable-sigsegv --disable-eigen --disable-offscreen CPPFLAGS="$GLMINC $XDRFLAGS" LDFLAGS="$XDRLIB" \
  CXXFLAGS=-O2 CFLAGS=-O2 > conf.log
grep -q '^#define HAVE_LIBTIRPC 1' config.h || echo "build_asy_native.sh: no libtirpc, so no XDR or V3D (Galley's asy has both)" >&2
make -j2 asy > make.log
echo "built $B/asy (base modules in $B/base)"
