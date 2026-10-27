// galley_main for C++ programs: their main() is called through real_main
#include <emscripten.h>
extern "C" int real_main(int argc, char **argv);
extern "C" EMSCRIPTEN_KEEPALIVE int galley_main(int argc, char **argv) { return real_main(argc, argv); }
int main() { return 0; }
