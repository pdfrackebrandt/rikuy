# Asymptote 3D

asy is built without OpenGL. 3D output comes out as vector drawings.

## What needs OpenGL

- Rendered bitmaps of 3D scenes (the default desktop output for many 3D examples).
- WebGL or PRC export for interactive 3D.

## What needs only GLM

- Vector projection of 3D scenes (current output). GLM is header-only and is
  used for the math; no OpenGL context is required for the projection itself.

## Mesa software rasterizer

softpipe (Mesa's software rasterizer) could produce bitmaps without a GPU.
llvmpipe needs a JIT and is harder to compile to WebAssembly. softpipe is
possible in principle but:
- Size: Mesa is large.
- Speed: software rasterization of complex scenes is slow in WASM.
- Not attempted in this build.

## Current status

3D examples produce vector drawings that match the geometric content of the
desktop output, but not the rendered bitmap appearance. A pixel comparison
against desktop asy with OpenGL will show differences in shading and lighting.

## Recommendation

For documents that need rendered 3D bitmaps, the user can run asy on the
desktop and include the resulting image. The browser asy is sufficient for
vector 3D and for documents that do not rely on OpenGL shading.
