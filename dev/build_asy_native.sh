#!/bin/sh
# A desktop Asymptote of exactly the version and source Galley's is built from (tex/build_tools.sh:
# TeX Live's utils/asymptote at its pinned commit), compiled natively, with the same features
# switched off and on (no threads, readline, FFTW, GSL, curl or GC; GLM when Galley has it; XDR;
# OpenGL through the same Mesa's OSMesa on softpipe, without GLUT, with MESA=1, else none).
# PLAN tasks 9, 10 and 17 compare Galley's asy with this one.
# Usage: build_asy_native.sh [OUT]   (default $GALLEY_WORK/asy-native; needs $GALLEY_SRC/tl from
#        build_tools.sh, $GALLEY_SRC/glm when GLM=1, and Mesa's tarball in $GALLEY_SRC/dl when
#        MESA=1; Galley's asy now has both: GLM=1 MESA=1)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${GALLEY_SRC:-/tmp/src}
OUT=${1:-${GALLEY_WORK:-/tmp/eng}/asy-native}
B="$OUT/build"
rm -rf "$B" && mkdir -p "$OUT" && cp -r "$SRC/tl/utils/asymptote" "$B"
cd "$B"
touch -d '2000-01-01' configure.ac  # as build_tools.sh: make must not rerun autoconf
# with GLM, asy needs the edits Galley's gets for GLM and for OSMesa without GLUT (patch_asy.py)
[ "${GLM:-0}" = 1 ] && python3 "$HERE/../tex/native/patch_asy.py" . --native
GLMINC=""
[ "${GLM:-0}" = 1 ] && GLMINC="-I$SRC/glm"
# Mesa as build_tools.sh builds it for Galley, natively and unpatched (a shared OSMesa); the GL
# asy's configure links with -lGL, which is OSMesa's own here
GL="--disable-gl --disable-offscreen" GLINC="" GLLIB=""
if [ "${MESA:-0}" = 1 ]; then
  M="$OUT/mesa"
  if [ ! -f "$M/inst/lib/libOSMesa.so" ]; then
    rm -rf "$M" && mkdir -p "$M/src"
    tar --no-same-owner -xzf "$SRC/dl/mesa_24.0.5.orig.tar.gz" -C "$M/src" --strip-components=1
    meson setup "$M/build" "$M/src" --prefix="$M/inst" --libdir=lib \
      -Dbuildtype=release -Dbuild-tests=false -Dosmesa=true -Dgallium-drivers=swrast -Dvulkan-drivers= -Dplatforms= \
      -Dglx=disabled -Degl=disabled -Dgbm=disabled -Dgles1=disabled -Dgles2=disabled -Dllvm=disabled -Dshared-glapi=disabled \
      -Dgallium-nine=false -Dgallium-opencl=disabled -Dgallium-rusticl=false -Dgallium-va=disabled -Dgallium-vdpau=disabled -Dgallium-xa=disabled \
      -Dexpat=disabled -Dlibunwind=disabled -Dshader-cache=disabled -Dvalgrind=disabled -Dxmlconfig=disabled -Dzstd=disabled \
      > "$OUT/mesa-setup.log"
    ninja -C "$M/build" install > "$OUT/mesa-build.log"
  fi
  mkdir -p "$M/gl" && ln -sf "$M/inst/lib/libOSMesa.so" "$M/gl/libGL.so"
  # (glew.h includes GLU, which Mesa no longer ships and asy does not call)
  GL="--enable-offscreen ac_cv_lib_glut_glutMainLoop=no" GLINC="-I$M/inst/include -DGLEW_NO_GLU" GLLIB="-L$M/gl -L$M/inst/lib -Wl,-rpath,$M/inst/lib"
fi
# XDR (V3D, xinput/xoutput) as Galley's asy has it: libtirpc's headers from the system
# (libtirpc-dev) or from $TIRPC/include/tirpc with the library in $TIRPC/lib
TIRPC=${TIRPC:-${GALLEY_WORK:-/tmp/eng}/tirpc}
XDRFLAGS="" XDRLIB=""
[ -d "$TIRPC/include/tirpc" ] && XDRFLAGS="-I$TIRPC/include/tirpc" XDRLIB="-L$TIRPC/lib"
./configure --prefix="$OUT/inst" --disable-gc --disable-threads --disable-readline --disable-fftw --disable-gsl $GL \
  --disable-curl --disable-lsp --disable-sigsegv --disable-eigen CPPFLAGS="$GLMINC $XDRFLAGS $GLINC" LDFLAGS="$XDRLIB $GLLIB" \
  CXXFLAGS=-O2 CFLAGS=-O2 > conf.log
grep -q '^#define HAVE_LIBTIRPC 1' config.h || echo "build_asy_native.sh: no libtirpc, so no XDR or V3D (Galley's asy has both)" >&2
[ "${MESA:-0}" != 1 ] || grep -q '^#define HAVE_LIBOSMESA 1' config.h || { echo "build_asy_native.sh: configure did not take OSMesa" >&2; exit 1; }
make -j2 asy > make.log
echo "built $B/asy (base modules in $B/base)"
