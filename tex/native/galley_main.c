/* Entry point for Galley's tools built with Emscripten. The program's own main() is compiled as
   real_main (-Dmain=real_main): this toolchain (Debian's Emscripten 3.1.6 with clang 15) does not
   export a main(int, char **), so the worker calls galley_main itself (tools.js emProgram). */
#include <emscripten.h>
extern int real_main(int argc, char **argv);
EMSCRIPTEN_KEEPALIVE int galley_main(int argc, char **argv) { return real_main(argc, argv); }
int main(void) { return 0; }
