/* A small XDR (RFC 4506) for Asymptote's xstream in WebAssembly, where no Sun RPC library
   exists: stdio and memory streams, the integer and floating types xstream.h asks for. */
#ifndef GALLEY_RPC_H
#define GALLEY_RPC_H
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <sys/types.h>

typedef int bool_t;
typedef char *caddr_t;
typedef unsigned int u_int;
enum xdr_op { XDR_ENCODE = 0, XDR_DECODE = 1, XDR_FREE = 2 };
typedef struct XDR { enum xdr_op x_op; FILE *file; char *mem; unsigned size, pos; } XDR;

static inline void xdrstdio_create(XDR *x, FILE *f, enum xdr_op op) { x->x_op = op; x->file = f; x->mem = 0; x->size = 0; x->pos = 0; }
static inline void xdrmem_create(XDR *x, char *a, unsigned size, enum xdr_op op) { x->x_op = op; x->file = 0; x->mem = a; x->size = size; x->pos = 0; }
static inline void xdr_destroy(XDR *x) { if (x->file) fflush(x->file); }
static inline unsigned xdr_getpos(XDR *x) { return x->file ? (unsigned) ftell(x->file) : x->pos; }
static inline bool_t xdr_setpos(XDR *x, unsigned p) { if (x->file) return fseek(x->file, p, SEEK_SET) == 0; if (p > x->size) return 0; x->pos = p; return 1; }

static inline bool_t galley_xdr_bytes(XDR *x, unsigned char *b, unsigned n) {
  if (x->file) return (x->x_op == XDR_ENCODE ? fwrite(b, 1, n, x->file) : fread(b, 1, n, x->file)) == n;
  if (x->pos + n > x->size) return 0;
  if (x->x_op == XDR_ENCODE) memcpy(x->mem + x->pos, b, n); else memcpy(b, x->mem + x->pos, n);
  x->pos += n;
  return 1;
}
static inline bool_t galley_xdr_u32(XDR *x, uint32_t *v) {
  unsigned char b[4];
  if (x->x_op == XDR_FREE) return 1;
  if (x->x_op == XDR_ENCODE) { b[0] = *v >> 24; b[1] = *v >> 16; b[2] = *v >> 8; b[3] = *v; return galley_xdr_bytes(x, b, 4); }
  if (!galley_xdr_bytes(x, b, 4)) return 0;
  *v = ((uint32_t) b[0] << 24) | ((uint32_t) b[1] << 16) | ((uint32_t) b[2] << 8) | b[3];
  return 1;
}
static inline bool_t galley_xdr_u64(XDR *x, uint64_t *v) {
  uint32_t hi = (uint32_t) (*v >> 32), lo = (uint32_t) *v;
  if (!galley_xdr_u32(x, &hi) || !galley_xdr_u32(x, &lo)) return 0;
  if (x->x_op == XDR_DECODE) *v = ((uint64_t) hi << 32) | lo;
  return 1;
}
#define GALLEY_XDR32(name, T) static inline bool_t name(XDR *x, T *p) { uint32_t v = (uint32_t) (int64_t) *p; if (!galley_xdr_u32(x, &v)) return 0; if (x->x_op == XDR_DECODE) *p = (T) v; return 1; }
#define GALLEY_XDR32S(name, T) static inline bool_t name(XDR *x, T *p) { uint32_t v = (uint32_t) (int32_t) *p; if (!galley_xdr_u32(x, &v)) return 0; if (x->x_op == XDR_DECODE) *p = (T) (int32_t) v; return 1; }
GALLEY_XDR32S(xdr_int, int)
GALLEY_XDR32(xdr_u_int, unsigned int)
GALLEY_XDR32S(xdr_short, short)
GALLEY_XDR32(xdr_u_short, unsigned short)
GALLEY_XDR32S(xdr_char, char)
GALLEY_XDR32(xdr_u_char, unsigned char)
GALLEY_XDR32S(xdr_long, long)
GALLEY_XDR32(xdr_u_long, unsigned long)
GALLEY_XDR32S(xdr_bool, bool_t)
GALLEY_XDR32S(xdr_int16_t, int16_t)
GALLEY_XDR32(xdr_u_int16_t, uint16_t)
GALLEY_XDR32S(xdr_int32_t, int32_t)
GALLEY_XDR32(xdr_u_int32_t, uint32_t)
static inline bool_t xdr_int64_t(XDR *x, int64_t *p) { uint64_t v = (uint64_t) *p; if (!galley_xdr_u64(x, &v)) return 0; if (x->x_op == XDR_DECODE) *p = (int64_t) v; return 1; }
static inline bool_t xdr_u_int64_t(XDR *x, uint64_t *p) { return galley_xdr_u64(x, p); }
static inline bool_t xdr_longlong_t(XDR *x, long long *p) { uint64_t v = (uint64_t) *p; if (!galley_xdr_u64(x, &v)) return 0; if (x->x_op == XDR_DECODE) *p = (long long) v; return 1; }
static inline bool_t xdr_u_longlong_t(XDR *x, unsigned long long *p) { uint64_t v = *p; if (!galley_xdr_u64(x, &v)) return 0; if (x->x_op == XDR_DECODE) *p = v; return 1; }
static inline bool_t xdr_float(XDR *x, float *p) { uint32_t v; memcpy(&v, p, 4); if (!galley_xdr_u32(x, &v)) return 0; if (x->x_op == XDR_DECODE) memcpy(p, &v, 4); return 1; }
static inline bool_t xdr_double(XDR *x, double *p) { uint64_t v; memcpy(&v, p, 8); if (!galley_xdr_u64(x, &v)) return 0; if (x->x_op == XDR_DECODE) memcpy(p, &v, 8); return 1; }
#endif
