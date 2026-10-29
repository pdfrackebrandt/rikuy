#!/usr/bin/env python3
"""gnuplot for the browser (build_tools.sh gnuplot).

complexfun.c checks for floating point underflow after cexp() and friends. Where the C library
reports underflow through FE_UNDERFLOW it clears errno or reports it; where it does not (musl in
WebAssembly has no floating point exception flags) the fallback raises the error unconditionally,
errno or not, so every igamma() failed with "Igamma: errno = 0" (pgfplots' gnuplot plots of the
chi-squared distribution came out empty). The fallback here raises it only when errno is set.

gnuplot's license lets a modified build be passed on only under its own version label, so the
patchlevel says this is Rikuy's build ("show version" prints "patchlevel 2-rikuy").

Usage: patch_gnuplot.py GNUPLOT_SOURCE_DIR
"""
import os, sys

d = sys.argv[1]


def edit(name, old, new):
    p = os.path.join(d, name)
    s = open(p, encoding='utf-8').read()
    if new in s:
        return
    assert s.count(old) == 1, (name, old[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(old, new))


edit('src/complexfun.c',
     '#define handle_underflow( who, var ) int_error(NO_CARET, "%s: errno = %d", who, errno);',
     '#define handle_underflow( who, var ) if (errno) int_error(NO_CARET, "%s: errno = %d", who, errno);')
edit('src/version.c',
     'const char gnuplot_patchlevel[] = "2";',
     'const char gnuplot_patchlevel[] = "2-rikuy";')
print('patched', d)
