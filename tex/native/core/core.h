// Rikuy's native core: the editor's pure computation over long texts, in C++ for WebAssembly.
// The page talks to it through src/native.js: text goes in as UTF-16 code units (the offsets
// the editor counts in), results come out as a list of 32-bit numbers that the JavaScript side
// turns back into the objects its own implementation makes. Nothing here touches the page.
// No exceptions, no RTTI, no standard library containers: malloc and plain arrays keep the
// module small and its memory easy to reason about.
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define CORE_EXPORT(name) extern "C" __attribute__((export_name(#name), used))

namespace core {

// A growing list of 32-bit values. Grows by doubling with realloc; a failed allocation sets
// bad, and the caller answers "no result" so that JavaScript does the work instead.
struct Out {
  int32_t *a = nullptr;
  uint32_t n = 0, cap = 0;
  bool bad = false;
  // (at most 2^28 values, 1 GiB: past it the doubling and the byte count would overflow 32 bits)
  void reserve(uint32_t want) {
    if (want <= cap || bad) return;
    if (want > (1u << 28)) { bad = true; return; }
    uint32_t c = cap ? cap : 1024;
    while (c < want) c *= 2;
    int32_t *p = (int32_t *)realloc(a, (size_t)c * 4);
    if (!p) { bad = true; return; }
    a = p; cap = c;
  }
  void push(int32_t v) {
    if (n == cap) { reserve(n + 1); if (bad) return; }
    a[n++] = v;
  }
  uint32_t mark() { push(0); return n - 1; }
  void set(uint32_t k, int32_t v) { if (k < n) a[k] = v; }
  void inc(uint32_t k) { if (k < n) a[k]++; }
  void truncate(uint32_t k) { if (k < n) n = k; }
};

// A UTF-16 string the JavaScript side wrote into the module's memory.
struct Text {
  char16_t *p = nullptr;
  uint32_t n = 0, cap = 0;
  // (at most 2^29 code units, 1 GiB, more than a JavaScript string holds)
  char16_t *ensure(uint32_t want) {
    if (want > (1u << 29)) { n = 0; return nullptr; }
    if (want > cap) {
      free(p);
      cap = want < 4096 ? 4096 : want;
      p = (char16_t *)malloc((size_t)cap * 2);
      if (!p) { cap = 0; n = 0; return nullptr; }
    }
    n = want;
    return p;
  }
};

// A string of the tables, the key of a map: points into memory the core owns.
struct Key { const char16_t *p; uint32_t n; };

inline uint32_t hashOf(const char16_t *p, uint32_t n) {
  uint32_t h = 2166136261u;
  for (uint32_t k = 0; k < n; k++) { h ^= p[k]; h *= 16777619u; }
  return h;
}

// An open addressing map from a string to a small number (a signature's index, or 1 for "in
// the set"). Built once per table; looked up with a slice of the source.
struct Map {
  struct Slot { const char16_t *p; uint32_t n; int32_t v; };
  Slot *s = nullptr;
  uint32_t cap = 0, used = 0;
  void clear() { free(s); s = nullptr; cap = used = 0; }
  bool grow() {
    uint32_t nc = cap ? cap * 2 : 64;
    Slot *ns = (Slot *)calloc(nc, sizeof(Slot));
    if (!ns) return false;
    for (uint32_t k = 0; k < cap; k++) if (s[k].p) {
      uint32_t h = hashOf(s[k].p, s[k].n) & (nc - 1);
      while (ns[h].p) h = (h + 1) & (nc - 1);
      ns[h] = s[k];
    }
    free(s); s = ns; cap = nc;
    return true;
  }
  bool put(const char16_t *p, uint32_t n, int32_t v) {
    if ((used + 1) * 2 > cap && !grow()) return false;
    uint32_t h = hashOf(p, n) & (cap - 1);
    while (s[h].p) {
      if (s[h].n == n && !memcmp(s[h].p, p, n * 2)) { s[h].v = v; return true; }
      h = (h + 1) & (cap - 1);
    }
    s[h].p = p; s[h].n = n; s[h].v = v; used++;
    return true;
  }
  // -1 when absent
  int32_t get(const char16_t *p, uint32_t n) const {
    if (!cap) return -1;
    uint32_t h = hashOf(p, n) & (cap - 1);
    while (s[h].p) {
      if (s[h].n == n && !memcmp(s[h].p, p, n * 2)) return s[h].v;
      h = (h + 1) & (cap - 1);
    }
    return -1;
  }
};

// JavaScript's white space, as \s and String.prototype.trim know it
inline bool jsSpace(int c) {
  return c == 9 || c == 10 || c == 11 || c == 12 || c == 13 || c == 32 || c == 0xA0 || c == 0x1680 ||
         (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F ||
         c == 0x3000 || c == 0xFEFF;
}
// what a regular expression's . takes without the s flag: anything but a line terminator
inline bool jsDot(int c) { return c >= 0 && c != 10 && c != 13 && c != 0x2028 && c != 0x2029; }
inline bool isLetter(int c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }

}  // namespace core
