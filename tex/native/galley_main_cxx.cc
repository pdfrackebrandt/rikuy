// galley_main.c for C++ programs: their main(), compiled as real_main, has C++ linkage
#include <emscripten.h>
int real_main(int argc, char **argv);
extern "C" EMSCRIPTEN_KEEPALIVE int galley_main(int argc, char **argv) { return real_main(argc, argv); }
int main() { return 0; }
