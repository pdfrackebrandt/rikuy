// Rikuy's picture tools (src/picfx.js): Picture Format's Corrections, Color and Transparency and
// Compress Pictures, on a PNG or JPEG of the project, in C. stb_image reads the file, stb_image_write
// writes the new one (both public domain, pinned by hash in tex/build_tools.sh); the rest is here.
//
// One picture at a time, as RGBA bytes: pic_in gives a buffer for the file, pic_decode reads it,
// pic_adjust and pic_resize change it, pic_encode writes a PNG or a JPEG into the output that
// pic_out points at. No library but Emscripten's libc and its small allocator: a standalone module
// with no JavaScript glue, as the native core is.

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <emscripten/emscripten.h>

#define STBI_NO_STDIO
#define STBI_NO_HDR
#define STBI_NO_LINEAR
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_ASSERT(x) ((void)0)
// (a side as long as stb takes: the 40 million pixels of pic_decode is the bound, so a picture of
// 20000 by 2 pixels is read and one of 100000 by 100000 is "too large", not "no PNG")
#define STBI_MAX_DIMENSIONS (1 << 24)
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STBI_WRITE_NO_STDIO
#define STBIW_ASSERT(x) ((void)0)
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

static unsigned char *in_buf = 0;
static int in_cap = 0;
static unsigned char *img = 0;      // the picture, RGBA, W by H
static int W = 0, H = 0, CH = 0;    // CH: the channels the file had (1 to 4)
static unsigned char *out_buf = 0;
static int out_len = 0, out_cap = 0;

static inline unsigned char clamp8(float v) { return v <= 0.f ? 0 : v >= 255.f ? 255 : (unsigned char)(v + 0.5f); }
static inline float lum(float r, float g, float b) { return 0.299f * r + 0.587f * g + 0.114f * b; }

// a buffer of n bytes for the file to read
EMSCRIPTEN_KEEPALIVE unsigned char *pic_in(int n) {
  if (n <= 0) return 0;
  if (n > in_cap) { free(in_buf); in_buf = (unsigned char *)malloc(n); in_cap = in_buf ? n : 0; }
  return in_buf;
}
// reads the n bytes of pic_in as a PNG or JPEG; 1 when it could, -1 for one too large
EMSCRIPTEN_KEEPALIVE int pic_decode(int n) {
  if (img) { stbi_image_free(img); img = 0; }
  W = H = CH = 0;
  if (!in_buf || n <= 0 || n > in_cap) return 0;
  int w, h, ch;
  // (a stranger's picture of more than 40 million pixels is refused before it is decoded: its
  // RGBA would take more than 160 MB, a decompression bomb's way to stop the tab)
  if (!stbi_info_from_memory(in_buf, n, &w, &h, &ch)) {
    // (stb refuses a header whose pixels would pass 1 GiB: that is "too large", not "no picture")
    const char *why = stbi_failure_reason();
    return why && strstr(why, "large") ? -1 : 0;
  }
  if ((long long)w * h > 40000000LL) return -1;
  img = stbi_load_from_memory(in_buf, n, &w, &h, &ch, 4);
  if (!img) return 0;
  W = w; H = h; CH = ch;
  return 1;
}
EMSCRIPTEN_KEEPALIVE int pic_width(void) { return W; }
EMSCRIPTEN_KEEPALIVE int pic_height(void) { return H; }
EMSCRIPTEN_KEEPALIVE int pic_channels(void) { return CH; }
EMSCRIPTEN_KEEPALIVE unsigned char *pic_pixels(void) { return img; }
// whether any pixel is less than opaque (a PNG of an alpha channel that is all 255 is opaque)
EMSCRIPTEN_KEEPALIVE int pic_has_alpha(void) {
  if (!img) return 0;
  size_t n = (size_t)W * H;
  for (size_t i = 0; i < n; i++) if (img[4 * i + 3] != 255) return 1;
  return 0;
}

// Every correction at once, from the picture as it was read, in Word's order:
//   sharpen in -1..1 (above 0 sharper by an unsharp mask, below softer towards a blur);
//   brightness and contrast in -1..1 (Word's -40% to +40% are -0.4 to 0.4);
//   saturation 0..4 (1 as it is, 0 gray); tone -1..1 (warmer above 0, as Word's colour
//   temperature above 6500 K); recolor 0 none, 1 grayscale, 2 sepia, 3 washout, 4 black and white,
//   5 a duotone of the colour r, g, b (black, the colour at the middle gray, white);
//   transparency 0..1 (each pixel's alpha times 1 - t)
EMSCRIPTEN_KEEPALIVE int pic_adjust(float sharpen, float bright, float contrast, float sat, float tone, int recolor, int cr, int cg, int cb, float transp) {
  if (!img) return 0;
  const size_t n = (size_t)W * H;
  // sharpen or soften: the difference from a 3 by 3 blur (1 2 1 each way), added or taken
  if (sharpen != 0.f && W > 2 && H > 2) {
    unsigned char *blur = (unsigned char *)malloc(n * 4);
    if (!blur) return 0;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) for (int c = 0; c < 3; c++) {
      int s = 0, wsum = 0;
      for (int dy = -1; dy <= 1; dy++) {
        int yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (int dx = -1; dx <= 1; dx++) {
          int xx = x + dx; if (xx < 0 || xx >= W) continue;
          int k = (dx ? 1 : 2) * (dy ? 1 : 2);
          s += k * img[4 * ((size_t)yy * W + xx) + c]; wsum += k;
        }
      }
      blur[4 * ((size_t)y * W + x) + c] = (unsigned char)((s + wsum / 2) / wsum);
    }
    // (Word's +100% sharpen is a strong mask, its -100% soften the blur itself)
    const float k = sharpen > 0 ? sharpen * 2.f : sharpen;
    for (size_t i = 0; i < n; i++) for (int c = 0; c < 3; c++) {
      float v = img[4 * i + c], b = blur[4 * i + c];
      img[4 * i + c] = clamp8(v + k * (v - b));
    }
    free(blur);
  }
  // contrast about the middle gray, then brightness towards white or black
  const float f = contrast >= 0 ? 1.f / fmaxf(0.05f, 1.f - contrast) : 1.f + contrast;
  for (size_t i = 0; i < n; i++) {
    unsigned char *p = img + 4 * i;
    float r = p[0], g = p[1], b = p[2];
    if (contrast != 0.f) { r = (r - 127.5f) * f + 127.5f; g = (g - 127.5f) * f + 127.5f; b = (b - 127.5f) * f + 127.5f; }
    if (bright != 0.f) { r += bright * 255.f; g += bright * 255.f; b += bright * 255.f; }
    if (sat != 1.f) { float l = lum(r, g, b); r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
    if (tone != 0.f) { r *= 1.f + 0.25f * tone; b *= 1.f - 0.25f * tone; g *= 1.f + 0.05f * tone; }
    if (recolor) {
      float l = lum(fminf(255.f, fmaxf(0.f, r)), fminf(255.f, fmaxf(0.f, g)), fminf(255.f, fmaxf(0.f, b)));
      switch (recolor) {
        case 1: r = g = b = l; break;
        case 2: { float R = r, G = g, B = b; r = 0.393f * R + 0.769f * G + 0.189f * B; g = 0.349f * R + 0.686f * G + 0.168f * B; b = 0.272f * R + 0.534f * G + 0.131f * B; break; }
        case 3: r = 178.5f + 0.3f * r; g = 178.5f + 0.3f * g; b = 178.5f + 0.3f * b; break;
        case 4: r = g = b = l >= 127.5f ? 255.f : 0.f; break;
        case 5: {
          float t = l / 255.f;
          if (t < 0.5f) { r = cr * 2.f * t; g = cg * 2.f * t; b = cb * 2.f * t; }
          else { float u = (t - 0.5f) * 2.f; r = cr + (255.f - cr) * u; g = cg + (255.f - cg) * u; b = cb + (255.f - cb) * u; }
          break;
        }
      }
    }
    p[0] = clamp8(r); p[1] = clamp8(g); p[2] = clamp8(b);
    if (transp > 0.f) p[3] = clamp8(p[3] * (1.f - fminf(1.f, transp)));
  }
  return 1;
}

// The picture made w by h pixels, each new pixel the mean of the old ones it covers (a box filter
// with fractional edges: a downscale that keeps fine lines as gray, not lost)
EMSCRIPTEN_KEEPALIVE int pic_resize(int w, int h) {
  if (!img || w <= 0 || h <= 0 || w > W || h > H) return 0;
  if (w == W && h == H) return 1;
  float *row = (float *)malloc(sizeof(float) * 4 * (size_t)w * H);
  unsigned char *out = (unsigned char *)STBI_MALLOC((size_t)w * h * 4);
  if (!row || !out) { free(row); if (out) STBI_FREE(out); return 0; }
  const double sx = (double)W / w, sy = (double)H / h;
  // across: each row to w pixels (alpha weighted, so a clear pixel gives no colour)
  for (int y = 0; y < H; y++) for (int x = 0; x < w; x++) {
    double x0 = x * sx, x1 = (x + 1) * sx, a = 0, r = 0, g = 0, b = 0, wt = 0;
    for (int i = (int)x0; i < (int)ceil(x1) && i < W; i++) {
      double c = fmin(x1, i + 1.0) - fmax(x0, (double)i);
      if (c <= 0) continue;
      const unsigned char *p = img + 4 * ((size_t)y * W + i);
      double al = p[3] / 255.0;
      r += c * p[0] * al; g += c * p[1] * al; b += c * p[2] * al; a += c * p[3]; wt += c;
    }
    float *q = row + 4 * ((size_t)y * w + x);
    q[0] = (float)r; q[1] = (float)g; q[2] = (float)b; q[3] = (float)a; (void)wt;
  }
  // down: each column to h pixels
  for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) {
    double y0 = y * sy, y1 = (y + 1) * sy, a = 0, r = 0, g = 0, b = 0, wt = 0;
    for (int j = (int)y0; j < (int)ceil(y1) && j < H; j++) {
      double c = fmin(y1, j + 1.0) - fmax(y0, (double)j);
      if (c <= 0) continue;
      const float *q = row + 4 * ((size_t)j * w + x);
      r += c * q[0]; g += c * q[1]; b += c * q[2]; a += c * q[3]; wt += c;
    }
    unsigned char *o = out + 4 * ((size_t)y * w + x);
    double area = wt * sx;   // pixels covered: sx across, wt down
    double al = a / 255.0;
    o[3] = clamp8((float)(a / area));
    if (al > 0) { o[0] = clamp8((float)(r / al)); o[1] = clamp8((float)(g / al)); o[2] = clamp8((float)(b / al)); }
    else o[0] = o[1] = o[2] = 0;
  }
  free(row);
  stbi_image_free(img);
  img = out; W = w; H = h;
  return 1;
}

static void put(void *ctx, void *data, int size) {
  (void)ctx;
  if (size <= 0) return;
  if (out_len + size > out_cap) {
    int cap = out_cap ? out_cap : 65536;
    while (cap < out_len + size) cap *= 2;
    unsigned char *b = (unsigned char *)realloc(out_buf, cap);
    if (!b) return;
    out_buf = b; out_cap = cap;
  }
  memcpy(out_buf + out_len, data, size);
  out_len += size;
}
// The picture written: format 0 PNG (with its alpha where alpha is 1, else RGB), 1 JPEG of the
// quality given (1 to 100, RGB: a JPEG has no alpha). Returns the bytes written, 0 on failure.
EMSCRIPTEN_KEEPALIVE int pic_encode(int format, int quality, int alpha) {
  if (!img) return 0;
  out_len = 0;
  const size_t n = (size_t)W * H;
  if (format == 0 && alpha) return stbi_write_png_to_func(put, 0, W, H, 4, img, W * 4) ? out_len : 0;
  unsigned char *rgb = (unsigned char *)malloc(n * 3);
  if (!rgb) return 0;
  // (a pixel less than opaque laid on white, as a page shows it)
  for (size_t i = 0; i < n; i++) {
    const unsigned char *p = img + 4 * i;
    const float a = p[3] / 255.f;
    for (int c = 0; c < 3; c++) rgb[3 * i + c] = clamp8(p[c] * a + 255.f * (1.f - a));
  }
  int ok = format == 0 ? stbi_write_png_to_func(put, 0, W, H, 3, rgb, W * 3) : stbi_write_jpg_to_func(put, 0, W, H, 3, rgb, quality < 1 ? 1 : quality > 100 ? 100 : quality);
  free(rgb);
  return ok ? out_len : 0;
}
EMSCRIPTEN_KEEPALIVE unsigned char *pic_out(void) { return out_buf; }
// what a picture holds, freed when it is done with
EMSCRIPTEN_KEEPALIVE void pic_done(void) {
  if (img) { stbi_image_free(img); img = 0; }
  free(in_buf); in_buf = 0; in_cap = 0;
  free(out_buf); out_buf = 0; out_cap = 0; out_len = 0;
  W = H = CH = 0;
}
