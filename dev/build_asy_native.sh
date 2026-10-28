#!/bin/sh
# A desktop Asymptote of exactly the version and source Galley's is built from (tex/build_tools.sh:
# TeX Live's utils/asymptote at its pinned commit), compiled natively, with the same features
# switched off and on (no threads, readline, curl, sigsegv, language server or GC; GSL 2.8,
# FFTW 3.3.11 and Eigen 3.4.0 as Galley's, built here natively from the same tarballs; GLM when
# Galley has it; XDR; OpenGL through the same Mesa's OSMesa on softpipe, without GLUT, with MESA=1,
# else none). PLAN tasks 9, 10 and 17 compare Galley's asy with this one.
# Usage: build_asy_native.sh [OUT]   (default $GALLEY_WORK/asy-native; needs $GALLEY_SRC/tl, dl and
#        eigen from build_tools.sh asy, and $GALLEY_SRC/glm when GLM=1; Galley's asy has GLM and
#        Mesa: GLM=1 MESA=1)
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
  GL="--enable-offscreen ac_cv_lib_glut_glutMainLoop=no" GLINC="-I$M/inst/include -DGLEW_NO_GLU=" GLLIB="-L$M/gl -L$M/inst/lib -Wl,-rpath,$M/inst/lib"
fi
# GSL and FFTW, static, from the tarballs build_tools.sh fetched
for L in gsl fftw; do
  case $L in
    gsl) A=libgsl.a T="$SRC/dl/gsl_2.8+dfsg.orig.tar.gz" X="" ;;
    fftw) A=libfftw3.a T="$SRC/dl/fftw3_3.3.11.orig.tar.gz" X="--disable-fortran --disable-threads --disable-openmp --disable-doc" ;;
  esac
  if [ ! -f "$OUT/$L/lib/$A" ]; then
    rm -rf "$OUT/$L" && mkdir -p "$OUT/$L/src"
    tar --no-same-owner -xzf "$T" -C "$OUT/$L/src" --strip-components=1
    # (Debian's GSL tarball leaves out parts of the manual its Makefile builds, as build_tools.sh says)
    [ $L = gsl ] && printf 'all install install-data install-exec install-strip check installcheck clean distclean mostlyclean maintainer-clean uninstall info dvi pdf html ps tags ctags distdir:\n\t@:\n' > "$OUT/$L/src/doc/Makefile.in"
    (cd "$OUT/$L/src" && ./configure --disable-shared --enable-static $X --prefix="$OUT/$L" CFLAGS=-O2 > conf.log && make -j2 > make.log && make install > inst.log)
  fi
done
LIBINC="-I$OUT/gsl/include -I$OUT/fftw/include -I$SRC/eigen" LIBLIB="-L$OUT/gsl/lib -L$OUT/fftw/lib"
# XDR (V3D, xinput/xoutput) as Galley's asy has it: libtirpc's headers from the system
# (libtirpc-dev) or from $TIRPC/include/tirpc with the library in $TIRPC/lib
TIRPC=${TIRPC:-${GALLEY_WORK:-/tmp/eng}/tirpc}
XDRFLAGS="" XDRLIB=""
[ -d "$TIRPC/include/tirpc" ] && XDRFLAGS="-I$TIRPC/include/tirpc" XDRLIB="-L$TIRPC/lib"
./configure --prefix="$OUT/inst" --disable-gc --disable-threads --disable-readline $GL \
  --disable-curl --disable-lsp --disable-sigsegv CPPFLAGS="$GLMINC $XDRFLAGS $GLINC $LIBINC" LDFLAGS="$XDRLIB $GLLIB $LIBLIB" \
  CXXFLAGS=-O2 CFLAGS=-O2 > conf.log
grep -q '^#define HAVE_LIBTIRPC 1' config.h || echo "build_asy_native.sh: no libtirpc, so no XDR or V3D (Galley's asy has both)" >&2
[ "${MESA:-0}" != 1 ] || grep -q '^#define HAVE_LIBOSMESA 1' config.h || { echo "build_asy_native.sh: configure did not take OSMesa" >&2; exit 1; }
for d in HAVE_LIBGSL HAVE_LIBFFTW3 HAVE_EIGEN_DENSE; do
  grep -q "^#define $d 1" config.h || { echo "build_asy_native.sh: configure did not set $d" >&2; exit 1; }
done
make -j2 asy > make.log
echo "built $B/asy (base modules in $B/base)"
