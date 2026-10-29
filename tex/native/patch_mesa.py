#!/usr/bin/env python3
"""Mesa 24.0.5 for WebAssembly: OSMesa on softpipe, the software rasterizer that needs no JIT,
as a static library for asy's offscreen renderer (PLAN task 17; build_tools.sh mesa).

Usage: patch_mesa.py MESA_SOURCE_DIR
"""
import os, sys

d = sys.argv[1]


def edit(name, old, new, count=1):
    p = os.path.join(d, name)
    s = open(p, encoding='utf-8').read()
    n = s.count(old)
    if n != count:
        sys.exit('patch_mesa.py: %s: expected %d of %r, found %d' % (name, count, old[:60], n))
    open(p, 'w', encoding='utf-8').write(s.replace(old, new))


# Emscripten's libc is musl with a Linux system call layer: Mesa's Linux paths fit it (headers,
# clock_nanosleep, sysconf for the page size and memory), its "unexpected platform" errors do not
edit('src/util/detect_os.h', '''#if defined(__linux__)
#define DETECT_OS_LINUX 1''', '''#if defined(__linux__) || defined(__EMSCRIPTEN__)
#define DETECT_OS_LINUX 1''')

# musl declares secure_getenv in stdlib.h, Emscripten's libc does not define it: meson's link
# test finds no secure_getenv and u_debug.h's stand in, static, clashes with the declaration
edit('src/util/u_debug.h', '''#ifndef HAVE_SECURE_GETENV
static inline char *secure_getenv(const char *name)
{
   return getenv(name);
}
#endif''', '''#ifndef HAVE_SECURE_GETENV
static inline char *mesa_secure_getenv(const char *name)
{
   return getenv(name);
}
#define secure_getenv mesa_secure_getenv
#endif''')

# ... but not its thread names or the current CPU, which it has neither: one thread, no CPUs
edit('src/util/u_thread.c', '''#if DETECT_OS_LINUX && !defined(ANDROID)
   return sched_getcpu();''', '''#if DETECT_OS_LINUX && !defined(ANDROID) && !defined(__EMSCRIPTEN__)
   return sched_getcpu();''')
edit('src/util/u_thread.c', '''#if defined(HAVE_PTHREAD)
#if DETECT_OS_LINUX || DETECT_OS_CYGWIN''', '''#if defined(HAVE_PTHREAD) && !defined(__EMSCRIPTEN__)
#if DETECT_OS_LINUX || DETECT_OS_CYGWIN''')

# a static OSMesa: asy links it in, there are no shared libraries in WebAssembly
edit('src/gallium/targets/osmesa/meson.build', 'libosmesa = shared_library(', 'libosmesa = static_library(')
edit('src/gallium/targets/osmesa/meson.build', '''  link_args : [ld_args_gc_sections, osmesa_link_args],
  vs_module_defs : osmesa_def,
''', '')
edit('src/gallium/targets/osmesa/meson.build', '''  link_depends : osmesa_link_deps,
''', '')
edit('src/gallium/targets/osmesa/meson.build', '''  name_prefix : host_machine.system() == 'windows' ? '' : [],  # otherwise mingw will create libosmesa.dll
  soversion : host_machine.system() == 'windows' ? '' : '8',
  version : '8.0.0',
  darwin_versions : '9.0.0',
''', '')

# and nothing after it: the symbols check, pkg-config file and tests want the shared library
p = os.path.join(d, 'src/gallium/targets/osmesa/meson.build')
s = open(p, encoding='utf-8').read()
k = s.find('\nif with_symbols_check\n')
if k < 0:
    sys.exit('patch_mesa.py: osmesa/meson.build: no symbols check to cut')
open(p, 'w', encoding='utf-8').write(s[:k + 1])

print('patched', d)
