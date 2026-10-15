#!/bin/sh
# Programs Galley builds from source with Emscripten (Ubuntu's emscripten 3.1.6 package, which
# brings clang 15): TeX Live's dvips, Asymptote and xindy. Each lands in vendor/<name>/ as
# <name>.js (a classic script defining Galley<Name>) and <name>.wasm; build_tree.py packs the
# .wasm with the other programs and build.mjs copies the .js next to the engine.
#
# Their main() is compiled as real_main and entered through galley_main (native/galley_main.c):
# this Emscripten does not export a main(int, char **) built by clang 15. tools.js calls it.
#
# Usage: build_tools.sh [dvips] [asy] [xindy]      (default: all)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${GALLEY_SRC:-/tmp/src}
VENDOR=$HERE/vendor
TL_COMMIT=f6b450440fca5d39f069f1d43153f7a8a75b04a1   # TeX-Live/texlive-source, 2026-10-10
mkdir -p "$SRC" "$VENDOR"
export EM_NODE_JS=${EM_NODE_JS:-/usr/bin/node}
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

# Asymptote 3.09 without OpenGL, threads, readline, FFTW, GSL, curl or its garbage collector
# (each run gets fresh memory anyway); native/patch_asy.py routes its pipes and System() to
# the worker, native/rpc/ stands in for Sun RPC's XDR
asy() {
  texlive_source; zlib
  B="$SRC/asy/build"
  if [ ! -f "$B/asy" ]; then
    rm -rf "$B" && mkdir -p "$SRC/asy" && cp -r "$SRC/tl/utils/asymptote" "$B"
    cd "$B"
    python3 "$HERE/native/patch_asy.py" .
    emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-gc --disable-threads --disable-readline \
      --disable-fftw --disable-gsl --disable-gl --disable-curl --disable-lsp --disable-sigsegv --disable-eigen --disable-xdr --disable-offscreen \
      CXXFLAGS="-O2 -fexceptions" CFLAGS=-O2 CPPFLAGS="-I$SRC/zlib/include" LDFLAGS="-L$SRC/zlib/lib -fexceptions" > conf.log
    sed -i "s#^OPTS = \$(DEFS) -I$SRC/zlib/include #OPTS = \$(DEFS) -I$SRC/zlib/include -I$HERE/native #" Makefile
    grep -q "^OPTS = .*-I$HERE/native" Makefile || { echo "build_tools.sh: could not add native/ to OPTS in Makefile" >&2; exit 1; }
    rm -f ./*.d
    emmake make -j2 asy > make.log
  fi
  cd "$B"
  em++ -DHAVE_CONFIG_H -DFFTWPP_SINGLE_THREAD -I. -I"$SRC/zlib/include" -I"$HERE/native" -Itinyexr -O2 -fexceptions -std=c++17 \
    -Ibackports/optional/include -Iprc/include -ILspCpp/include -Dmain=real_main -c main.cc -o main-galley.o
  em++ -O2 -c "$HERE/native/galley_main_cxx.cc" -o galley_main_cxx.o
  OBJS=$(sed -n 's/.*-o asy \(.*\) -L.*zlib\/lib.*/\1/p' make.log | tail -1 | sed 's/ main.o / main-galley.o /')
  mkdir -p "$VENDOR/asy/base"
  em++ -O2 -fexceptions $OBJS galley_main_cxx.o -L"$SRC/zlib/lib" -lz -o "$VENDOR/asy/asy.js" $(echo $LINK | sed 's/-O2//') -sEXPORT_NAME=GalleyAsy -sINITIAL_MEMORY=67108864 -sTOTAL_STACK=5242880
  # its base modules go into the TeX tree at TeX Live's place (texmf-dist/asymptote, build_tree.py)
  cp base/*.asy "$VENDOR/asy/base/"
  ls -l "$VENDOR/asy"
}

# ---- xindy -----------------------------------------------------------------------------------
# TeX Live's xindy is Common Lisp run by CLISP. Here it runs on ECL 24.5.10, built for
# WebAssembly with its GMP and Boehm GC (Ubuntu's source packages: GitLab and gnu.org are not
# reachable from the build machine), with tex2xindy and native/xindy/main.c in one program.
# ECL's cross build needs a native ECL of the same version to compile its Lisp library.
# The Boehm GC finds pointers only in memory, so binaryen's spill-pointers pass (from npm: the
# system's binaryen 108 lacks it) copies those held in WebAssembly locals there at each call.
UBUNTU=https://archive.ubuntu.com/ubuntu/pool
fetch() { # fetch URL SHA256: into $SRC/dl, checked
  mkdir -p "$SRC/dl"
  f="$SRC/dl/$(basename "$1")"
  [ -f "$f" ] || curl -sSfL -o "$f" "$1"
  echo "$2  $f" | sha256sum -c --quiet
}
ECL_V=24.5.10.20250914.git294da20
ecl_source() { # ecl_source DIR: ECL's source; Debian took out the bundled GMP and GC, and with them autoconf's helpers
  fetch $UBUNTU/universe/e/ecl/ecl_$ECL_V+dfsg.orig.tar.xz 6a06bbd5248ba9128b84b7a25833f9db7f6df0ad3795b63574c328192755b6c4
  rm -rf "$1" && mkdir -p "$1" && tar xf "$SRC/dl/ecl_$ECL_V+dfsg.orig.tar.xz" -C "$1" --strip-components=1
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
    rm -rf "$SRC/gmp" && mkdir -p "$SRC/gmp" && tar xf "$SRC/dl/gmp_6.3.0+dfsg.orig.tar.xz" -C "$SRC/gmp" --strip-components=1
    mkdir -p "$SRC/gmp/doc" "$SRC/gmp/build-wasm" # Debian's tarball has no manual; configure still names its Makefile
    printf 'all install install-data install-exec install-strip check installcheck clean distclean mostlyclean maintainer-clean uninstall info dvi pdf html ps tags ctags distdir:\n\t@:\n' > "$SRC/gmp/doc/Makefile.in"
    (cd "$SRC/gmp/build-wasm" && emconfigure ../configure --host=none --build=x86_64-pc-linux-gnu --disable-assembly --disable-shared --enable-static --prefix="$P" CFLAGS=-O2 > conf.log && emmake make -j2 > make.log && emmake make install > inst.log)
  fi
  if [ ! -f "$P/lib/libgc.a" ]; then
    fetch $UBUNTU/main/libg/libgc/libgc_8.2.8.orig.tar.gz 7649020621cb26325e1fb5c8742590d92fb48ce5c259b502faf7d9fb5dabb160
    rm -rf "$SRC/gc" && mkdir -p "$SRC/gc/build-wasm" && tar xf "$SRC/dl/libgc_8.2.8.orig.tar.gz" -C "$SRC/gc" --strip-components=1
    (cd "$SRC/gc/build-wasm" && emconfigure ../configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu --disable-threads --disable-shared --enable-static --disable-docs --prefix="$P" CFLAGS=-O2 > conf.log && emmake make -j1 > make.log && emmake make install > inst.log)
  fi
}
ecl_wasm() {
  [ -f "$SRC/ecl-wasm/build/libecl.a" ] && return
  ecl_host; wasm_libs
  ecl_source "$SRC/ecl-wasm"
  # ECL's settings for Emscripten expect a newer one than Ubuntu's 3.1.6 (STACK_SIZE, the
  # spill-pointers pass at link, done here after linking instead), optimize nothing, and use
  # the bundled GMP Debian removed
  python3 - "$SRC/ecl-wasm/src/configure" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
a = s.index('        wasm32-unknown-emscripten)'); b = s.index("INSTALL_TARGET='flatinstall'", a)
seg = s[a:b]
new = (seg.replace('-DECL_C_COMPATIBLE_VARIADIC_DISPATCH -O0', '-DECL_C_COMPATIBLE_VARIADIC_DISPATCH')
          .replace('-sSTACK_SIZE=1048576 -sBINARYEN_EXTRA_PASSES=--spill-pointers', '-sTOTAL_STACK=1048576')
          .replace("                enable_gmp='portable'\n                with_c_gmp=yes\n", ''))
assert new != seg
open(p, 'w').write(s[:a] + new + s[b:])
PY
  (cd "$SRC/ecl-wasm" && ECL_TO_RUN="$SRC/ecl-host/bin/ecl" emconfigure ./configure --host=wasm32-unknown-emscripten --build=x86_64-pc-linux-gnu \
      --with-cross-config="$SRC/ecl-wasm/src/util/wasm32-unknown-emscripten.cross_config" --prefix="$SRC/ecl-wasm/out" --disable-shared \
      --with-tcp=no --with-cmp=no --enable-gmp=system --with-gmp-prefix="$SRC/wasm-prefix" --enable-boehm=system --enable-threads=no --with-dffi=no \
      CPPFLAGS="-I$SRC/wasm-prefix/include" LDFLAGS="-L$SRC/wasm-prefix/lib" CFLAGS=-O2 > conf.log &&
    ECL_TO_RUN="$SRC/ecl-host/bin/ecl" emmake make -j2 > make.log)
}
xindy() {
  texlive_source; ecl_wasm
  [ -x "$SRC/binaryen/node_modules/binaryen/bin/wasm-opt" ] || (mkdir -p "$SRC/binaryen" && cd "$SRC/binaryen" && npm install --silent binaryen@123.0.0 > /dev/null)
  X="$SRC/xindy" && rm -rf "$X" && mkdir -p "$X"
  python3 "$HERE/native/xindy/patch_xindy.py" "$SRC/tl/utils/xindy/xindy-src/src" "$X/lisp" /texlive/texmf-dist/xindy/modules
  I="-I$SRC/ecl-wasm/build -I$SRC/wasm-prefix/include"
  emcc -O2 $I -c "$HERE/native/xindy/main.c" -o "$X/main.o"
  emcc -O2 -Dmain=tex2xindy_main -c "$SRC/tl/utils/xindy/xindy-src/tex2xindy/tex2xindy.c" -o "$X/tex2xindy.o"
  mkdir -p "$VENDOR/xindy"
  emcc -O2 "$X/main.o" "$X/tex2xindy.o" "$SRC/ecl-wasm/build/libecl.a" -L"$SRC/wasm-prefix/lib" -lgmp -lgc -lm --embed-file "$X/lisp@/xindy" \
    -sMODULARIZE=1 -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sTOTAL_STACK=4194304 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker,node \
    -sEXPORTED_RUNTIME_METHODS=FS,ENV -sEXPORTED_FUNCTIONS=_galley_main,_xindy_boot,_malloc,_fflush -sEXPORT_NAME=GalleyXindy -o "$VENDOR/xindy/xindy.js"
  node "$SRC/binaryen/node_modules/binaryen/bin/wasm-opt" "$VENDOR/xindy/xindy.wasm" --spill-pointers -O2 -o "$VENDOR/xindy/xindy.wasm"
  # the modules (TeX Live's texmf-dist/xindy/modules): Debian's xindy-rules, with the language
  # modules make-rules generates (with CLISP) already made; build_tree.py puts them in the tree
  fetch $UBUNTU/universe/x/xindy/xindy-rules_2.5.1.20160104-12build2_all.deb 0c9e20debe3f1a5a601025fb70cdccf32c81b07bc28bd41591dc2dcce3986086
  rm -rf "$X/deb" "$VENDOR/xindy/modules" && dpkg-deb -x "$SRC/dl/xindy-rules_2.5.1.20160104-12build2_all.deb" "$X/deb"
  cp -r "$X/deb/usr/share/xindy" "$VENDOR/xindy/modules"
  ls -l "$VENDOR/xindy"
}

[ $# -gt 0 ] || set -- dvips asy xindy
for t in "$@"; do "$t"; done
