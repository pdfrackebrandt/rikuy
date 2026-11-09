#!/bin/sh
# Programs Rikuy builds from source with Emscripten (Ubuntu's emscripten 3.1.6 package, which
# brings clang 15): TeX Live's dvips, Asymptote and xindy, and gnuplot. Each lands in
# vendor/<name>/ as <name>.js (a classic script defining Galley<Name>: Rikuy's first name, kept
# inside the programs) and <name>.wasm; build_tree.py packs the .wasm with the other programs
# and build.mjs copies the .js next to the engine.
#
# Their main() is compiled as real_main and entered through galley_main (native/galley_main.c):
# this Emscripten does not export a main(int, char **) built by clang 15. tools.js calls it.
#
# Usage: build_tools.sh [dvips] [asy] [xindy] [gnuplot] [mesa] [gsl] [fftw] [eigen]
#   (default: the four programs; mesa, gsl, fftw and eigen build only asy's libraries, into
#   $RIKUY_SRC)   env: RIKUY_SRC, RIKUY_VENDOR, UBUNTU_POOL
# Needs: Ubuntu's emscripten 3.1.6 and node; git, curl, make, pkg-config, xz and bzip2; meson,
#   ninja, bison, flex and Python 3 with mako (Mesa); gcc with libgmp-dev and libgc-dev (a native
#   ECL, which compiles ECL's Lisp for WebAssembly); dpkg-deb (xindy's modules)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${RIKUY_SRC:-/tmp/src}
VENDOR=${RIKUY_VENDOR:-$HERE/vendor}   # set RIKUY_VENDOR to build somewhere else and compare
TL_COMMIT=f6b450440fca5d39f069f1d43153f7a8a75b04a1   # TeX-Live/texlive-source, 2026-10-10
mkdir -p "$SRC" "$VENDOR"
export EM_NODE_JS=${EM_NODE_JS:-/usr/bin/node}
# The compiler writes source file names into the programs (__FILE__, in assert messages): they
# name $SRC as /src and this folder as /repo/tex, so the programs are the same wherever the
# sources and the repository are. EMCC_CFLAGS reaches every emcc and em++, configure's and
# meson's included, and stays out of the flags some libraries record (FFTW's fftw_cc).
export EMCC_CFLAGS="-ffile-prefix-map=$SRC=/src -ffile-prefix-map=$HERE=/repo/tex"
LINK="-O2 -sMODULARIZE=1 -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker,node -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV -sEXPORTED_FUNCTIONS=_galley_main,_malloc,_fflush,_main"

texlive_source() {
  if [ ! -d "$SRC/tl/.git" ]; then
    git clone --filter=blob:none --sparse https://github.com/TeX-Live/texlive-source "$SRC/tl"
  fi
  (cd "$SRC/tl" && git sparse-checkout set build-aux m4 am texk/kpathsea texk/dvipsk texk/am texk/m4 utils/asymptote utils/xindy libs/zlib && git checkout -q $TL_COMMIT)
  # TeX Live's configure scripts expect the build folders side by side under texk/
  mkdir -p "$SRC/bk"
  ln -sfn "$SRC/bk" "$SRC/texk"
}

kpathsea() {
  [ -f "$SRC/bk/kpathsea/.libs/libkpathsea.a" ] && return
  mkdir -p "$SRC/bk/kpathsea"
  (cd "$SRC/bk/kpathsea" &&
    emconfigure ../../tl/texk/kpathsea/configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-shared --enable-static CFLAGS=-O2 > conf.log &&
    emmake make -j2 > make.log)
}

galley_main() {
  emcc -O2 -c "$HERE/native/galley_main.c" -o "$SRC/galley_main.o"
}

dvips() {
  texlive_source; kpathsea; galley_main
  mkdir -p "$SRC/bk/dvipsk"
  cd "$SRC/bk/dvipsk"
  [ -f Makefile ] || emconfigure ../../tl/texk/dvipsk/configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-shared CFLAGS=-O2 > conf.log
  emmake make -j2 dvips CFLAGS="-O2 -Dmain=real_main" > make.log
  mkdir -p "$VENDOR/dvips"
  emcc $LINK -sEXPORT_NAME=GalleyDvips bbox.o bitmapenc.o color.o dopage.o dosection.o dospecial.o download.o dpicheck.o drawPS.o dviinput.o dvips.o emspecial.o finclude.o fontdef.o header.o hps.o loadfont.o output.o papersiz.o pprescan.o prescan.o repack.o resident.o scalewidth.o scanpage.o search.o skippage.o t1part.o tfmload.o unpack.o virtualfont.o writet1.o \
    "$SRC/galley_main.o" "$SRC/bk/kpathsea/.libs/libkpathsea.a" -o "$VENDOR/dvips/dvips.js"
  ls -l "$VENDOR/dvips"
}

zlib() {
  [ -f "$SRC/zlib/lib/libz.a" ] && return
  mkdir -p "$SRC/zlib/include" "$SRC/zlib/lib"
  cp "$SRC/tl/libs/zlib/zlib-src/zconf.h.in" "$SRC/zlib/include/zconf.h"
  cp "$SRC/tl/libs/zlib/zlib-src/zlib.h" "$SRC/zlib/include/"
  for f in adler32 compress crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil; do
    emcc -O2 -DHAVE_UNISTD_H -I"$SRC/zlib/include" -c "$SRC/tl/libs/zlib/zlib-src/$f.c" -o "$SRC/zlib/$f.o"
  done
  emar rcs "$SRC/zlib/lib/libz.a" "$SRC"/zlib/*.o
}

# GLM 1.0.1, the header-only vector library Asymptote's WebGL (HTML) and V3D outputs need; it
# needs no OpenGL (a git clone of its tag, checked against the commit: the commit pins the files
# as a hash pins a tarball)
GLM_COMMIT=0af55ccecd98d4e5a8d1fad7de25ba429d60e863
glm() {
  [ -f "$SRC/glm/glm/glm.hpp" ] && return
  rm -rf "$SRC/glm" && git clone -q --depth 1 --branch 1.0.1 https://github.com/g-truc/glm "$SRC/glm"
  [ "$(git -C "$SRC/glm" rev-parse HEAD)" = "$GLM_COMMIT" ] || { echo "build_tools.sh: glm 1.0.1 is not $GLM_COMMIT" >&2; exit 1; }
}

# Mesa 24.0.5 (Ubuntu 24.04's source package): OSMesa on softpipe, the software rasterizer that
# needs no JIT, as static libraries for asy's rendered 3D (native/patch_mesa.py); no threads, no
# LLVM, no window system. Its build needs meson, ninja and Python's mako.
MESA_V=24.0.5
mesa() {
  zlib
  M="$SRC/mesa"
  [ -f "$M/lib/libOSMesa.a" ] && return
  fetch $UBUNTU/main/m/mesa/mesa_$MESA_V.orig.tar.gz 5fd81faf83923fbd5c860c77f9709f82c8e9bb8b91cb4c972ce8b64ec1006b67
  rm -rf "$M" && mkdir -p "$M/src" "$M/pc" "$M/lib"
  tar --no-same-owner -xzf "$SRC/dl/mesa_$MESA_V.orig.tar.gz" -C "$M/src" --strip-components=1
  python3 "$HERE/native/patch_mesa.py" "$M/src"
  printf 'prefix=%s\nName: zlib\nDescription: zlib built for WebAssembly (build_tools.sh)\nVersion: 1.3.1\nLibs: -L${prefix}/lib -lz\nCflags: -I${prefix}/include\n' "$SRC/zlib" > "$M/pc/zlib.pc"
  (cd "$M" && PKG_CONFIG_PATH="$M/pc" PKG_CONFIG_LIBDIR="$M/pc" meson setup build src --cross-file "$HERE/native/mesa-cross.ini" \
    -Dbuildtype=release -Ddefault_library=static -Dbuild-tests=false -Dosmesa=true -Dgallium-drivers=swrast -Dvulkan-drivers= -Dplatforms= \
    -Dglx=disabled -Degl=disabled -Dgbm=disabled -Dgles1=disabled -Dgles2=disabled -Dllvm=disabled -Dshared-glapi=disabled \
    -Dgallium-nine=false -Dgallium-opencl=disabled -Dgallium-rusticl=false -Dgallium-va=disabled -Dgallium-vdpau=disabled -Dgallium-xa=disabled \
    -Dexpat=disabled -Dlibunwind=disabled -Dshader-cache=disabled -Dvalgrind=disabled -Dxmlconfig=disabled -Dzstd=disabled -Dwrap_mode=nofallback \
    > setup.log && ninja -C build > build.log)
  # plain archives (meson makes thin ones, which name their members by path); libOSMesa.a holds
  # GL as well
  cp "$M/build/src/gallium/targets/osmesa/libOSMesa.a" "$M/lib/"
  for a in src/gallium/drivers/softpipe/libsoftpipe.a src/util/blake3/libblake3.a src/util/libmesa_util_sse41.a; do
    emar rcs "$M/lib/$(basename $a)" $(emar t "$M/build/$a")
  done
}
MESA_LIBS="-lOSMesa -lsoftpipe -lblake3 -lmesa_util_sse41"

# GSL 2.8, FFTW 3.3.11 and Eigen 3.4.0, the versions the desktop's asy links (Ubuntu 26.10's
# source packages): asy's gsl module, fft() and schur()/eigenvalues
GSL_V=2.8+dfsg
gsl() {
  texlive_source
  [ -f "$SRC/gsl/lib/libgsl.a" ] && return
  fetch $UBUNTU/universe/g/gsl/gsl_$GSL_V.orig.tar.gz 69614b7005133a2d3a75827044164de98670568382e3192888a3185578451a70
  rm -rf "$SRC/gsl" && mkdir -p "$SRC/gsl/src" && tar --no-same-owner -xzf "$SRC/dl/gsl_$GSL_V.orig.tar.gz" -C "$SRC/gsl/src" --strip-components=1
  cp "$SRC/tl/build-aux/config.sub" "$SRC/gsl/src/config.sub" # (its own predates Emscripten)
  # Debian's tarball leaves out parts of the manual, which its Makefile still builds
  printf 'all install install-data install-exec install-strip check installcheck clean distclean mostlyclean maintainer-clean uninstall info dvi pdf html ps tags ctags distdir:\n\t@:\n' > "$SRC/gsl/src/doc/Makefile.in"
  (cd "$SRC/gsl/src" && emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-shared --enable-static \
    --prefix="$SRC/gsl" CFLAGS=-O2 > conf.log && emmake make -j2 > make.log && emmake make install > inst.log)
}
FFTW_V=3.3.11
fftw() {
  texlive_source
  [ -f "$SRC/fftw/lib/libfftw3.a" ] && return
  fetch $UBUNTU/main/f/fftw3/fftw3_$FFTW_V.orig.tar.gz 5630c24cdeb33b131612f7eb4b1a9934234754f9f388ff8617458d0be6f239a1
  rm -rf "$SRC/fftw" && mkdir -p "$SRC/fftw/src" && tar --no-same-owner -xzf "$SRC/dl/fftw3_$FFTW_V.orig.tar.gz" -C "$SRC/fftw/src" --strip-components=1
  cp "$SRC/tl/build-aux/config.sub" "$SRC/fftw/src/config.sub" # (its own predates Emscripten)
  (cd "$SRC/fftw/src" && emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-shared --enable-static \
    --disable-fortran --disable-threads --disable-openmp --disable-doc --prefix="$SRC/fftw" CFLAGS=-O2 > conf.log && emmake make -j2 > make.log && emmake make install > inst.log)
}
eigen() {
  [ -f "$SRC/eigen/Eigen/Dense" ] && return
  fetch $UBUNTU/universe/e/eigen3/eigen3_3.4.0.orig.tar.bz2 b4c198460eba6f28d34894e3a5710998818515104d6e74e5cc331ce31e46e626
  rm -rf "$SRC/eigen" && mkdir -p "$SRC/eigen" && tar --no-same-owner -xjf "$SRC/dl/eigen3_3.4.0.orig.tar.bz2" -C "$SRC/eigen" --strip-components=1
}
# binaryen 123 (npm) for its spill-pointers pass, which the Boehm GC needs (xindy below): the
# registry's tarball, the one npm install binaryen@123.0.0 unpacks, checked like every other
# download (its sha512 is the registry's dist.integrity,
# sha512-/hls/a309aZCc0itqP6uhoR+5DsKSlJVfB8Opd2BY9Ndghs84IScTunlyidyF4r2Xe3lQttnfBNIDjaNpj6mTw==).
# It has no dependencies and no install scripts, so unpacking is all npm would do.
BINARYEN_V=123.0.0
WASM_OPT="$SRC/binaryen/package/bin/wasm-opt"
binaryen() {
  [ -f "$WASM_OPT" ] && return
  fetch https://registry.npmjs.org/binaryen/-/binaryen-$BINARYEN_V.tgz 11fcbcb97b5c8da3990106fb4e2d364ba95ddf313d7c0e61ca8e8c7948600f7f
  rm -rf "$SRC/binaryen" && mkdir -p "$SRC/binaryen" && tar --no-same-owner -xzf "$SRC/dl/binaryen-$BINARYEN_V.tgz" -C "$SRC/binaryen"
}

# Asymptote 3.09 with what the desktop's has, but threads, readline, curl, sigsegv, the language
# server and the Boehm GC: GLM (WebGL and V3D output), XDR, OpenGL through OSMesa for rendered 3D
# (no GLUT: no window), GSL, FFTW and Eigen. native/patch_asy.py routes its pipes and System() to
# the worker and renders in asy's own process (no fork), native/rpc/ stands in for Sun RPC's XDR.
# Without the GC asy frees nothing during a run. With it, measured 2026-10-28 (the GC asy bundles,
# its static data registered as roots, binaryen's spill-pointers pass for the pointers in
# WebAssembly locals): 3D pictures rendered two to three times slower (the pass slows softpipe
# too), and slope.asy still ran out of the 2 GB, with 1.5 GB in use after each collection where
# the desktop's 64 bit asy peaks at 270 MB (likely the conservative collector's false pointers:
# in 32 bits the heap spans most addresses, so many numbers look like pointers into it).
asy_built() {
  [ -f "$B/asy" ] || return 1
  for d in HAVE_LIBGLM HAVE_LIBTIRPC HAVE_LIBOSMESA HAVE_LIBGSL HAVE_LIBFFTW3 HAVE_EIGEN_DENSE; do grep -q "^#define $d 1" "$B/config.h" || return 1; done
  ! grep -q '^#define USEGC 1' "$B/config.h"
}
asy() {
  texlive_source; zlib; glm; mesa; gsl; fftw; eigen
  B="$SRC/asy/build"
  ASYLIBINC="-I$SRC/gsl/include -I$SRC/fftw/include -I$SRC/eigen"
  # (a build made before GLM, OSMesa or GSL was added, or by an older script, is redone)
  if ! asy_built; then
    rm -rf "$B" && mkdir -p "$SRC/asy" && cp -r "$SRC/tl/utils/asymptote" "$B"
    cd "$B"
    # cp gives every file about the same time in no set order; when configure.ac comes out newer
    # than configure, make reruns autoconf and configure and the Makefile edit below is lost
    touch -d '2000-01-01' configure.ac
    python3 "$HERE/native/patch_asy.py" .
    # configure's link tests for GL and OSMesa cannot pass here (-lGL is Emscripten's WebGL), and
    # it would take Emscripten's GLUT emulation for a window toolkit; those for FFTW and GSL
    # declare the function with another signature, which this Emscripten's binaryen cannot
    # finish linking: the answers are given. GSL and FFTW give their flags by pkg-config.
    PKG_CONFIG_LIBDIR="$SRC/gsl/lib/pkgconfig:$SRC/fftw/lib/pkgconfig" \
    emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-gc --disable-threads --disable-readline \
      --disable-curl --disable-lsp --disable-sigsegv --disable-xdr --enable-offscreen \
      ac_cv_lib_glut_glutMainLoop=no ac_cv_lib_GL_glDepthMask=yes ac_cv_lib_OSMesa_OSMesaCreateContext=yes \
      ac_cv_lib_fftw3_fftw_execute=yes ac_cv_lib_gsl_gsl_sf_debye_6=yes \
      CXXFLAGS="-O2 -fexceptions" CFLAGS=-O2 CPPFLAGS="-I$SRC/zlib/include -I$SRC/glm -I$SRC/mesa/src/include $ASYLIBINC" \
      LDFLAGS="-L$SRC/zlib/lib -L$SRC/mesa/lib -lsoftpipe -lblake3 -lmesa_util_sse41 -L$SRC/gsl/lib -L$SRC/fftw/lib -fexceptions" > conf.log
    for d in HAVE_LIBGLM HAVE_LIBOSMESA HAVE_LIBGSL HAVE_LIBFFTW3 HAVE_EIGEN_DENSE; do
      grep -q "^#define $d 1" config.h || { echo "build_tools.sh: configure did not set $d" >&2; exit 1; }
    done
    ! grep -q '^#define HAVE_LIBGLUT 1' config.h || { echo "build_tools.sh: configure took a GLUT" >&2; exit 1; }
    # GL is in libOSMesa.a; Emscripten's own -lGL would bring its WebGL along
    sed -i 's#^\(LIBS = .*-lOSMesa -lrt -lz\) -lGL #\1 #' Makefile
    ! grep -q '^LIBS = .*-lGL ' Makefile || { echo "build_tools.sh: could not take -lGL out of LIBS" >&2; exit 1; }
    # XDR (V3D output, xinput and xoutput files) through native/rpc, not the libtirpc configure
    # looks for (patch_asy.py)
    sed -i 's|^/\* #undef HAVE_LIBTIRPC \*/|#define HAVE_LIBTIRPC 1|' config.h
    grep -q '^#define HAVE_LIBTIRPC 1' config.h || { echo "build_tools.sh: could not turn on XDR in config.h" >&2; exit 1; }
    sed -i "s#^OPTS = \$(DEFS) -I$SRC/zlib/include #OPTS = \$(DEFS) -I$SRC/zlib/include -I$HERE/native #" Makefile
    grep -q "^OPTS = .*-I$HERE/native" Makefile || { echo "build_tools.sh: could not add native/ to OPTS in Makefile" >&2; exit 1; }
    rm -f ./*.d
    emmake make -j2 asy > make.log
  fi
  cd "$B"
  em++ -DHAVE_CONFIG_H -DFFTWPP_SINGLE_THREAD -I. -I"$SRC/zlib/include" -I"$SRC/glm" -I"$SRC/mesa/src/include" $ASYLIBINC -I"$HERE/native" -Itinyexr -Ibackports/glew/include -O2 -fexceptions -std=c++17 \
    -Ibackports/optional/include -Iprc/include -ILspCpp/include -Dmain=real_main -c main.cc -o main-galley.o
  em++ -O2 -c "$HERE/native/galley_main_cxx.cc" -o galley_main_cxx.o
  OBJS=$(sed -n 's/.*-o asy \(.*\) -L.*zlib\/lib.*/\1/p' make.log | tail -1 | sed 's/ main.o / main-galley.o /')
  mkdir -p "$VENDOR/asy/base"
  em++ -O2 -fexceptions $OBJS glew.o galley_main_cxx.o -L"$SRC/zlib/lib" -L"$SRC/mesa/lib" $MESA_LIBS -L"$SRC/gsl/lib" -L"$SRC/fftw/lib" -lgsl -lgslcblas -lfftw3 -lz \
    -o "$VENDOR/asy/asy.js" $(echo $LINK | sed 's/-O2//') -sEXPORT_NAME=GalleyAsy -sINITIAL_MEMORY=67108864 -sTOTAL_STACK=5242880
  # its base modules and the shaders it renders with go into the TeX tree at TeX Live's place
  # (texmf-dist/asymptote, build_tree.py)
  cp base/*.asy "$VENDOR/asy/base/"
  mkdir -p "$VENDOR/asy/base/shaders" && cp base/shaders/*.glsl "$VENDOR/asy/base/shaders/"
  ls -l "$VENDOR/asy"
}

# ---- gnuplot -------------------------------------------------------------------------------------
# gnuplot 6.0.2, the version the desktop TeX Live of PLAN task 2 runs (Ubuntu 26.10's), from
# Ubuntu's source package; native/patch_gnuplot.py fixes its underflow check for WebAssembly.
# Terminals: the standalone ones (postscript, epslatex, pict2e, pstricks, svg, ...); no cairo, no
# Lua (tikz). The PostScript prologues the postscript and epslatex terminals copy into their
# output are in the TeX tree (extra/texlive/gnuplot-ps, the same files as term/PostScript here).
GNUPLOT_V=6.0.2+dfsg1
gnuplot() {
  galley_main
  fetch $UBUNTU/universe/g/gnuplot/gnuplot_$GNUPLOT_V.orig.tar.xz c02de00f808fd0911b68050b9ce4a4d9f2901aeca6fda66a2f41bfde650fabc2
  G="$SRC/gnuplot" && rm -rf "$G" && mkdir -p "$G" && tar xf "$SRC/dl/gnuplot_$GNUPLOT_V.orig.tar.xz" -C "$G" --strip-components=1
  # Debian's tarball leaves out src/beos, which configure still names
  mkdir -p "$G/src/beos" && printf 'all install install-strip uninstall check clean distclean mostlyclean maintainer-clean distdir:\n\t@:\n' > "$G/src/beos/Makefile.in"
  python3 "$HERE/native/patch_gnuplot.py" "$G"
  (cd "$G" && emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --prefix=/usr/local --without-x --without-qt \
      --without-cairo --without-wx --disable-wxwidgets --without-lua --without-gd --without-libcerf --without-caca --without-latex \
      --without-tektronix --without-linux-vga --with-readline=builtin --disable-plugins CFLAGS=-O2 > conf.log &&
    cd src && emmake make -j2 CFLAGS="-O2 -Dmain=real_main" gnuplot > make.log)
  OBJS=$(grep -- '-o gnuplot ' "$G/src/make.log" | tail -1 | grep -o '[A-Za-z0-9_./-]*\.o' | tr '\n' ' ')
  mkdir -p "$VENDOR/gnuplot"
  (cd "$G/src" && emcc $LINK -sEXPORT_NAME=GalleyGnuplot $OBJS "$SRC/galley_main.o" -lm -o "$VENDOR/gnuplot/gnuplot.js")
  ls -l "$VENDOR/gnuplot"
}

# ---- xindy -----------------------------------------------------------------------------------
# TeX Live's xindy is Common Lisp run by CLISP. Here it runs on ECL 24.5.10, built for
# WebAssembly with its GMP and Boehm GC (from Ubuntu's source packages, like every tarball
# here), with tex2xindy and native/xindy/main.c in one program.
# ECL's cross build needs a native ECL of the same version to compile its Lisp library.
# The Boehm GC finds pointers only in memory, so binaryen's spill-pointers pass (from npm: the
# system's binaryen 108 lacks it) copies those held in WebAssembly locals there at each call.
# Source tarballs come from Ubuntu's archive, each checked against its hash. The same files are
# kept as assets of this repository's "sources" release (SOURCES.md): put them in $SRC/dl first,
# or set UBUNTU_POOL to https://snapshot.ubuntu.com/ubuntu/20261028T000000Z/pool, if the archive
# ever drops one.
UBUNTU=${UBUNTU_POOL:-https://archive.ubuntu.com/ubuntu/pool}
fetch() { # fetch URL SHA256: into $SRC/dl, checked
  mkdir -p "$SRC/dl"
  f="$SRC/dl/$(basename "$1")"
  [ -f "$f" ] || curl -sSfL -o "$f" "$1"
  echo "$2  $f" | sha256sum -c --quiet
}
ECL_V=24.5.10.20250914.git294da20
ecl_source() { # ecl_source DIR: ECL's source; Debian took out the bundled GMP and GC, and with them autoconf's helpers
  fetch $UBUNTU/universe/e/ecl/ecl_$ECL_V+dfsg.orig.tar.xz 6a06bbd5248ba9128b84b7a25833f9db7f6df0ad3795b63574c328192755b6c4
  rm -rf "$1" && mkdir -p "$1" && tar --no-same-owner -xf "$SRC/dl/ecl_$ECL_V+dfsg.orig.tar.xz" -C "$1" --strip-components=1
  for d in gmp bdwgc; do mkdir -p "$1/src/$d"; cp "$1/src/config.guess" "$1/src/config.sub" "$1/src/$d/"; cp "$1/src/install.sh" "$1/src/$d/install-sh"; done
}
ecl_host() {
  [ -x "$SRC/ecl-host/bin/ecl" ] && return
  ecl_source "$SRC/ecl-host-build"
  (cd "$SRC/ecl-host-build" && ./configure --prefix="$SRC/ecl-host" --enable-boehm=system --enable-gmp=system --disable-threads > conf.log && make -j2 > make.log && make install > inst.log)
}
wasm_libs() { # GMP and the Boehm GC for WebAssembly, into $SRC/wasm-prefix
  P="$SRC/wasm-prefix"
  if [ ! -f "$P/lib/libgmp.a" ]; then
    fetch $UBUNTU/main/g/gmp/gmp_6.3.0+dfsg.orig.tar.xz bd2966e6d277f79328e894a5a9f3ba3fbf2ed2be81def5f48623e30c23fb1572
    rm -rf "$SRC/gmp" && mkdir -p "$SRC/gmp" && tar --no-same-owner -xf "$SRC/dl/gmp_6.3.0+dfsg.orig.tar.xz" -C "$SRC/gmp" --strip-components=1
    mkdir -p "$SRC/gmp/doc" "$SRC/gmp/build-wasm" # Debian's tarball has no manual; configure still names its Makefile
    printf 'all install install-data install-exec install-strip check installcheck clean distclean mostlyclean maintainer-clean uninstall info dvi pdf html ps tags ctags distdir:\n\t@:\n' > "$SRC/gmp/doc/Makefile.in"
    (cd "$SRC/gmp/build-wasm" && emconfigure ../configure --host=none --build=x86_64-pc-linux-gnu --disable-assembly --disable-shared --enable-static --prefix="$P" CFLAGS=-O2 > conf.log && emmake make -j2 > make.log && emmake make install > inst.log)
  fi
  if [ ! -f "$P/lib/libgc.a" ]; then
    fetch $UBUNTU/main/libg/libgc/libgc_8.2.8.orig.tar.gz 7649020621cb26325e1fb5c8742590d92fb48ce5c259b502faf7d9fb5dabb160
    rm -rf "$SRC/gc" && mkdir -p "$SRC/gc/build-wasm" && tar --no-same-owner -xf "$SRC/dl/libgc_8.2.8.orig.tar.gz" -C "$SRC/gc" --strip-components=1
    (cd "$SRC/gc/build-wasm" && emconfigure ../configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-threads --disable-shared --enable-static --disable-docs --prefix="$P" CFLAGS=-O2 > conf.log && emmake make -j1 > make.log && emmake make install > inst.log)
  fi
}
ecl_wasm() {
  [ -f "$SRC/ecl-wasm/build/libecl.a" ] && return
  ecl_host; wasm_libs
  ecl_source "$SRC/ecl-wasm"
  # ECL's settings for Emscripten expect a newer one than Ubuntu's 3.1.6 (STACK_SIZE, the
  # spill-pointers pass at link, done here after linking instead), optimize nothing, and use
  # the bundled GMP Debian removed. Its compiled Lisp would also hold the source folder (as
  # SRC:) and the time of the build: each file's init function is named from its full path and
  # the clock, and the name is kept as a string in the program. The folder is given as /src
  # (the build itself, which loads its Lisp through SRC:, is told the real one by ECLSRCDIR), and
  # the names come from the file's own folder and name, which are unique in ECL.
  python3 - "$SRC/ecl-wasm/src" <<'PY'
import sys
d = sys.argv[1]
p = d + '/configure'; s = open(p).read()
a = s.index('        wasm32-unknown-emscripten)'); b = s.index("INSTALL_TARGET='flatinstall'", a)
seg = s[a:b]
new = (seg.replace('-DECL_C_COMPATIBLE_VARIADIC_DISPATCH -O0', '-DECL_C_COMPATIBLE_VARIADIC_DISPATCH')
          .replace('-sSTACK_SIZE=1048576 -sBINARYEN_EXTRA_PASSES=--spill-pointers', '-sTOTAL_STACK=1048576')
          .replace("                enable_gmp='portable'\n                with_c_gmp=yes\n", ''))
assert new != seg
open(p, 'w').write(s[:a] + new + s[b:])
def patch(f, old, new):
    p = d + '/' + f; s = open(p).read()
    assert s.count(old) == 1, f
    open(p, 'w').write(s.replace(old, new))
patch('lsp/config.lsp.in', '#.(truename "@true_srcdir@/")', '#P"/src/ecl-wasm/src/"')
patch('cmp/cmpname.lsp', '''(path-hash (logxor (ash (sxhash path) 8)
                            (ash (sxhash (cddr (pathname-directory path))) 16)
                            (sxhash (pathname-name path))))
         (seconds (get-universal-time))
         (ms (+ (* seconds 1000)
                (mod (floor (* 1000 (get-internal-real-time))
                            internal-time-units-per-second)
                     1000)))''', '''(path-hash (logxor (ash (sxhash (last (pathname-directory path))) 16)
                            (sxhash (pathname-name path))))
         (ms 0)''')
PY
  # (the prefix is never installed to; ECL compiles it in as SYS:, so it too is named under /src)
  (cd "$SRC/ecl-wasm" && ECL_TO_RUN="$SRC/ecl-host/bin/ecl" emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu \
      --with-cross-config="$SRC/ecl-wasm/src/util/wasm32-unknown-emscripten.cross_config" --prefix=/src/ecl-wasm/out --disable-shared \
      --with-tcp=no --with-cmp=no --enable-gmp=system --with-gmp-prefix="$SRC/wasm-prefix" --enable-boehm=system --enable-threads=no --with-dffi=no \
      CPPFLAGS="-I$SRC/wasm-prefix/include" LDFLAGS="-L$SRC/wasm-prefix/lib" CFLAGS=-O2 > conf.log &&
    ECL_TO_RUN="$SRC/ecl-host/bin/ecl" ECLSRCDIR="$SRC/ecl-wasm/src/" emmake make -j2 > make.log)
}
xindy() {
  texlive_source; ecl_wasm; binaryen
  X="$SRC/xindy" && rm -rf "$X" && mkdir -p "$X"
  python3 "$HERE/native/xindy/patch_xindy.py" "$SRC/tl/utils/xindy/xindy-src/src" "$X/lisp" /texlive/texmf-dist/xindy/modules
  I="-I$SRC/ecl-wasm/build -I$SRC/wasm-prefix/include"
  emcc -O2 $I -c "$HERE/native/xindy/main.c" -o "$X/main.o"
  emcc -O2 -Dmain=tex2xindy_main -c "$SRC/tl/utils/xindy/xindy-src/tex2xindy/tex2xindy.c" -o "$X/tex2xindy.o"
  mkdir -p "$VENDOR/xindy"
  emcc -O2 "$X/main.o" "$X/tex2xindy.o" "$SRC/ecl-wasm/build/libecl.a" -L"$SRC/wasm-prefix/lib" -lgmp -lgc -lm --embed-file "$X/lisp@/xindy" \
    -sMODULARIZE=1 -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sTOTAL_STACK=4194304 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker,node \
    -sEXPORTED_RUNTIME_METHODS=FS,ENV -sEXPORTED_FUNCTIONS=_galley_main,_xindy_boot,_malloc,_fflush -sEXPORT_NAME=GalleyXindy -o "$VENDOR/xindy/xindy.js"
  node "$WASM_OPT" "$VENDOR/xindy/xindy.wasm" --spill-pointers -O2 -o "$VENDOR/xindy/xindy.wasm"
  # Loading the kernel as ECL bytecode (.fasc, compiled by this program) instead of source was
  # measured on 2026-10-19 (PLAN task 12): first boot in a fresh process 293 to 350 ms against
  # 321 to 418 ms, of which ECL's own start is about 200 ms. Not worth a second link and 130 KB.
  # the modules (TeX Live's texmf-dist/xindy/modules): Debian's xindy-rules, with the language
  # modules make-rules generates (with CLISP) already made; build_tree.py puts them in the tree
  fetch $UBUNTU/universe/x/xindy/xindy-rules_2.5.1.20160104-12build2_all.deb 0c9e20debe3f1a5a601025fb70cdccf32c81b07bc28bd41591dc2dcce3986086
  rm -rf "$X/deb" "$VENDOR/xindy/modules" && dpkg-deb -x "$SRC/dl/xindy-rules_2.5.1.20160104-12build2_all.deb" "$X/deb"
  cp -r "$X/deb/usr/share/xindy" "$VENDOR/xindy/modules"
  ls -l "$VENDOR/xindy"
}

[ $# -gt 0 ] || set -- dvips asy xindy gnuplot
for t in "$@"; do "$t"; done
