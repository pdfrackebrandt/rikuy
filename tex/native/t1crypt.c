/* Type 1 eexec / charstring cipher, for build_tree.py (pure Python is too slow for 150 MB). */
#include <stddef.h>
void t1_dec(const unsigned char *in, unsigned char *out, size_t n, unsigned r) {
  for (size_t i = 0; i < n; i++) { unsigned c = in[i]; out[i] = c ^ (r >> 8); r = ((c + r) * 52845u + 22719u) & 0xffffu; }
}
void t1_enc(const unsigned char *in, unsigned char *out, size_t n, unsigned r) {
  for (size_t i = 0; i < n; i++) { unsigned c = in[i] ^ (r >> 8); out[i] = c; r = ((c + r) * 52845u + 22719u) & 0xffffu; }
}
