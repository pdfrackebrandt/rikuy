# Mesa softpipe port for asy 3D bitmaps (task 17)

## Status

Mesa 23.1.0 source downloaded and extracted at /tmp/mesa-23.1.0.
OSMesa frontend is at src/gallium/frontends/osmesa.
softpipe driver is at src/gallium/drivers/softpipe.

## Blockers

1. Emscripten version: task wants 3.1.6, current emsdk is 6.0.12.
   The newer version may have different system headers.

2. Compile errors expected: about 190 at first count, needing:
   - _GNU_SOURCE defined
   - dladdr stubbed
   - os_sysinfo stubbed

3. meson cross file for emscripten needed.
   Example:
   ```
   [binaries]
   c = 'emcc'
   cpp = 'em++'
   ar = 'emar'
   [host_machine]
   system = 'emscripten'
   cpu_family = 'wasm32'
   cpu = 'wasm32'
   endian = 'little'
   ```

4. asy needs --enable-offscreen and the blend.glsl fix.

## Next steps

1. Create the meson cross file.
2. Configure with -Dgallium-drivers=softpipe -Dosmesa=true.
3. Stub the missing functions.
4. Link into asy and measure size/time.

## Current asy

asy is built without OpenGL (tex/build_tools.sh line 89).
3D output is vector drawings. The four failing examples
(functionshading, layers, spectrum, slidedemo) are documented
in PLAN.md task 18.

## Progress 2026-10-27

meson configured with:
- gallium-drivers=swrast
- osmesa=true
- glx=disabled, egl=disabled
- vulkan-drivers=[]
- platforms=[]

Patched meson.build to recognize emscripten as a known OS.

Blocked on zlib subproject hash mismatch. Mesa's wrap file expects a
different hash than the downloaded zlib-1.2.13.tar.gz. Fixing this needs
updating the wrap file or using a system zlib.

## Summary

The Mesa softpipe port is started but blocked on build dependencies.
The asy 3D bitmap task needs this port completed, then asy rebuilt with
--enable-offscreen, then size/time measured.

The four failing asy examples (task 18) have a pipe state reset added
to engine.js. A full test needs a working dist and browser.

## Progress 2026-10-27 (continued)

Built m4, bison, and flex from source. Mesa configure now reaches the
end but fails with "ld.wasm does not support shared libraries" even
with --default-library=static and -Dshared-glapi=disabled.

The error occurs during meson's compiler tests, not in Mesa's own
build files. This is a meson/emscripten interaction issue that needs
deeper investigation or a different build approach (e.g., building
OSMesa with a custom Makefile instead of meson).

## Task 17 status

Not finished. The Mesa softpipe port is blocked on the emscripten
shared library issue. A custom build of OSMesa or a meson patch is
needed.
