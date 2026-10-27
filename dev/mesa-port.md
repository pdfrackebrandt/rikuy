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
