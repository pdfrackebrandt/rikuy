// parse() of src/parser.js in C++: the same forgiving tree, every node with the same offsets, for
// the same text and user signatures. parser.js keeps the tables (PARSE_TABLES, read once by
// core_parse_tables) and parseJS, the reference this is tested against node for node
// (test/native.test.mjs); this file keeps only the algorithm, function for function in the order
// parser.js has them, so a change there is made here in the same place.
//
// The tree goes out as a list of 32-bit numbers, a node's fields before its children; lengths
// and ends that are known only later are written when they are (Out::set). src/native.js reads
// it back into the objects parseJS makes, strings taken from the source by their offsets.
//
// Where it cannot answer (memory, nesting deeper than DEPTH) it says so, and JavaScript parses:
// a document nested that deep gets exactly what it got before.
#include "core.h"

using namespace core;

namespace {

// node kinds and argument kinds of the list (src/native.js reads the same numbers)
enum { N_TEXT = 1, N_SPECIAL, N_COMMENT, N_PAR, N_GROUP, N_MATH, N_CMD, N_STRAY, N_VERB, N_ENV };
enum { A_NULL = 0, A_OPT, A_RAW, A_PLAIN, A_SINGLE };
enum { X_NONE = 0, X_UNKNOWN, X_ACCENT, X_DEF };
enum { D_LET = 1, D_OP, D_CMD, D_ENV };
// a special's ch beyond one code unit
enum { CH_DD = 0x10000, CH_PAREN, CH_BRACKET };
enum { STOP_NONE, STOP_BRACE, STOP_BRACKET };
// the deepest nesting of groups, environments and arguments parsed here; past it JavaScript does
// the work (the wasm stack is the page's JavaScript stack)
const int DEPTH = 200;
const int MATH_SCAN = 5000;   // parser.js's MATH_SCAN

// ---- the tables, from parser.js ------------------------------------------------------------
// One string: sections split by U+0003, entries by U+0001, a key and its value by U+0002.
Text tablesText;
Map SIG, CHARS, ACCENTS, ENV_SIG, MATH_ENVS, RAW_ENVS, DEF_CMDS, ENV_DEF, DIM_CMDS, PLAIN_ENVS;
// the signature strings the maps point at: [start, length] in the tables' text
struct Sig { const char16_t *p; uint32_t n; };
Sig *sigs = nullptr;
uint32_t nsigs = 0, capSigs = 0, nsigsTables = 0;
Text userText;
Map USER;
bool tablesOk = false;

// One lookup per command: every name any table or parseCommand's own tests know, with what it
// is (bits) and its signature's index in the upper half. Made from the tables at load; the
// commands parseCommand names itself are added from NAMED.
enum {
  F_DEF = 1, F_ENVDEF = 2, F_DIM = 4, F_ACCENT = 8, F_CHAR = 16, F_SIG = 32, F_BEGIN = 64, F_END = 128,
  F_VERB = 256, F_TEXDEF = 512, F_LET = 1024, F_DMO = 2048, F_NEWTHM = 4096, F_TIKZ = 8192
};
Map NAMES;
Text namedText;
struct Named { const char *name; int32_t flag; };
const Named NAMED[] = {
  { "begin", F_BEGIN }, { "end", F_END }, { "verb", F_VERB }, { "def", F_TEXDEF }, { "gdef", F_TEXDEF },
  { "edef", F_TEXDEF }, { "xdef", F_TEXDEF }, { "let", F_LET }, { "DeclareMathOperator", F_DMO },
  { "newtheorem", F_NEWTHM }, { "tikzstyle", F_TIKZ },
};
bool addFlags(const char16_t *p, uint32_t n, int32_t flags) {
  int32_t v = NAMES.get(p, n);
  return NAMES.put(p, n, (v < 0 ? 0 : v) | flags);
}
// every key of m, with flags (and, for SIG, its signature's index)
bool addAll(const Map &m, int32_t flags, bool sig) {
  for (uint32_t k = 0; k < m.cap; k++) {
    const Map::Slot &e = m.s[k];
    if (!e.p) continue;
    if (sig && (e.v < 0 || e.v > 0x7FFE)) return false;
    if (!addFlags(e.p, e.n, flags | (sig ? (e.v + 1) << 16 : 0))) return false;
  }
  return true;
}

int32_t addSig(const char16_t *p, uint32_t n) {
  if (nsigs == capSigs) {
    uint32_t c = capSigs ? capSigs * 2 : 256;
    Sig *s = (Sig *)realloc(sigs, c * sizeof(Sig));
    if (!s) return -1;
    sigs = s; capSigs = c;
  }
  sigs[nsigs] = { p, n };
  return (int32_t)nsigs++;
}

// fills maps from text [a, b): entries of key U+0002 value; with values, a value is a signature
bool readSection(const char16_t *a, const char16_t *b, Map &m, bool values) {
  const char16_t *p = a;
  while (p < b) {
    const char16_t *e = p;
    while (e < b && *e != 1) e++;
    const char16_t *k = p, *ke = p;
    while (ke < e && *ke != 2) ke++;
    int32_t v = 1;
    if (values) {
      const char16_t *vs = ke < e ? ke + 1 : e;
      v = addSig(vs, (uint32_t)(e - vs));
      if (v < 0) return false;
    }
    if (!m.put(k, (uint32_t)(ke - k), v)) return false;
    p = e < b ? e + 1 : b;
  }
  return true;
}

// ---- the parser ----------------------------------------------------------------------------
struct NodeInfo { int t; int e; };

// what parseSeq does with an ASCII character: 0 takes it as text and nothing else, wherever it
// stands; 1 is a space, tab or line end; 2 is one of \ { } $ % ~ & ^ _ # ], which it looks at.
// Every code unit from 128 on is 0.
const uint8_t KIND[128] = {
  0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 2, 0,
};

struct Parser {
  const char16_t *src;
  int n;
  int i = 0;
  Out &o;
  // the environments being read: their names as [start, end) of the source
  int *envS = nullptr, *envE = nullptr;
  int envN = 0, envCap = 0;
  int depth = 0;
  bool bail = false;

  // The first place of a pattern at or after p, remembered as parser.js's nextAt does: nothing
  // found from p is nothing from any later place, k found from p is k from every place up to k.
  // (Searches that leave i where it was ran to the end once per occurrence: quadratic on a
  // crafted file, and here a plain loop where V8's indexOf of one character is memchr.)
  struct Seen { int from = 0, found = -2; };  // found -2: nothing remembered yet
  Seen seenBracket, seenParen, seenSquare;
  struct EnvSeen { Seen exact, loose; int looseLen; };
  Map envIdx;                   // a raw environment's name (a slice of the source) -> its EnvSeen
  EnvSeen *envSeen = nullptr;
  int envSeenN = 0, envSeenCap = 0;

  // Every \end{name} of the text, as parser.js's endIndex finds them: per name, the sorted starts of
  // its exact ends (xPos) and of all its ends with their lengths (lPos, lLen), [off[id], off[id+1]).
  bool ixBuilt = false;
  Map ixNames;
  int ixN = 0;
  int *xOff = nullptr, *xPos = nullptr, *lOff = nullptr, *lPos = nullptr, *lLen = nullptr;

  Parser(const char16_t *s, int len, Out &out) : src(s), n(len), o(out) {}
  ~Parser() { free(envS); free(envE); free(envSeen); envIdx.clear(); ixNames.clear(); free(xOff); free(xPos); free(lOff); free(lPos); free(lLen); }

  static bool nameCh(int c) { return isLetter(c) || c == '@' || c == '*' || c == '_'; }
  bool buildEndIndex() {
    ixBuilt = true;
    // first the matches in the order of the text, then grouped by name (a counting sort keeps
    // each name's starts in order)
    int cap = 64, cnt = 0;
    int *ek = (int *)malloc(cap * 5 * sizeof(int));
    if (!ek) return false;
    for (int k = 0; k + 4 <= n; k++) {
      if (src[k] != '\\' || !startsWith("\\end", k)) continue;
      int p = k + 4;
      while (p < n && jsSpace(src[p])) p++;
      if (at(p) != '{') continue;
      int a = p + 1;
      while (a < n && jsSpace(src[a])) a++;
      int b = a;
      while (b < n && nameCh(src[b])) b++;
      int c = b;
      while (c < n && jsSpace(src[c])) c++;
      if (at(c) != '}') continue;
      int32_t id = ixNames.get(src + a, (uint32_t)(b - a));
      if (id < 0) { id = ixN++; if (!ixNames.put(src + a, (uint32_t)(b - a), id)) { free(ek); return false; } }
      if (cnt == cap) {
        cap *= 2;
        int *e2 = (int *)realloc(ek, (size_t)cap * 5 * sizeof(int));
        if (!e2) { free(ek); return false; }
        ek = e2;
      }
      int *e = ek + cnt * 5;
      e[0] = k; e[1] = id; e[2] = c + 1 - k; e[3] = at(k + 4) == '{' && a == k + 5 && c == b; e[4] = 0;
      cnt++;
      k = c;
    }
    xOff = (int *)calloc(ixN + 1, sizeof(int)); lOff = (int *)calloc(ixN + 1, sizeof(int));
    xPos = (int *)malloc((cnt + 1) * sizeof(int)); lPos = (int *)malloc((cnt + 1) * sizeof(int)); lLen = (int *)malloc((cnt + 1) * sizeof(int));
    if (!xOff || !lOff || !xPos || !lPos || !lLen) { free(ek); return false; }
    for (int q = 0; q < cnt; q++) { lOff[ek[q * 5 + 1] + 1]++; if (ek[q * 5 + 3]) xOff[ek[q * 5 + 1] + 1]++; }
    for (int q = 0; q < ixN; q++) { lOff[q + 1] += lOff[q]; xOff[q + 1] += xOff[q]; }
    int *lFill = (int *)malloc((ixN + 1) * sizeof(int)), *xFill = (int *)malloc((ixN + 1) * sizeof(int));
    if (!lFill || !xFill) { free(lFill); free(xFill); free(ek); return false; }
    memcpy(lFill, lOff, (ixN + 1) * sizeof(int)); memcpy(xFill, xOff, (ixN + 1) * sizeof(int));
    for (int q = 0; q < cnt; q++) {
      int *e = ek + q * 5, id = e[1];
      lPos[lFill[id]] = e[0]; lLen[lFill[id]] = e[2]; lFill[id]++;
      if (e[3]) xPos[xFill[id]++] = e[0];
    }
    free(lFill); free(xFill); free(ek);
    return true;
  }
  static int atOrAfter(const int *list, int lo, int hi, int p) {
    while (lo < hi) { int m = (lo + hi) >> 1; if (list[m] < p) lo = m + 1; else hi = m; }
    return lo;
  }

  static bool known(const Seen &c, int p) { return c.found != -2 && p >= c.from && (c.found < 0 || p <= c.found); }
  int nextCh(Seen &c, int ch, int p) {
    if (known(c, p)) return c.found;
    c.from = p; c.found = indexOf(ch, p);
    return c.found;
  }
  int nextStr(Seen &c, const char16_t *pat, int m, int p) {
    if (known(c, p)) return c.found;
    c.from = p; c.found = indexOfStr(pat, m, p);
    return c.found;
  }
  // the index of name [a, b)'s EnvSeen, made on first use; -1 when memory runs out
  int envSeenOf(int a, int b) {
    int32_t v = envIdx.get(src + a, (uint32_t)(b - a));
    if (v >= 0) return v;
    if (envSeenN == envSeenCap) {
      int c = envSeenCap ? envSeenCap * 2 : 16;
      EnvSeen *e = (EnvSeen *)realloc(envSeen, (size_t)c * sizeof(EnvSeen));
      if (!e) return -1;
      envSeen = e; envSeenCap = c;
    }
    if (!envIdx.put(src + a, (uint32_t)(b - a), envSeenN)) return -1;
    envSeen[envSeenN] = EnvSeen();
    envSeen[envSeenN].looseLen = 0;
    return envSeenN++;
  }

  // src[k] as JavaScript reads it: -1 past either end
  int at(int k) const { return k >= 0 && k < n ? src[k] : -1; }
  bool isWS(int c) const { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
  bool startsWith(const char *lit, int k) const {
    for (int q = 0; lit[q]; q++) if (at(k + q) != (unsigned char)lit[q]) return false;
    return true;
  }
  bool sliceIs(int a, int b, const char *lit) const {
    int q = 0;
    for (; lit[q]; q++) if (a + q >= b || src[a + q] != (unsigned char)lit[q]) return false;
    return a + q == b;
  }
  // src.indexOf(c, from) for one code unit
  int indexOf(int c, int from) const {
    if (from < 0) from = 0;
    for (int k = from; k < n; k++) if (src[k] == c) return k;
    return -1;
  }
  // src.indexOf of a string of ASCII and the given name
  int indexOfStr(const char16_t *pat, int m, int from) const {
    if (from < 0) from = 0;
    if (m == 0) return from <= n ? from : n;
    for (int k = from; k + m <= n; k++) {
      if (src[k] != pat[0]) continue;
      int q = 1;
      while (q < m && src[k + q] == pat[q]) q++;
      if (q == m) return k;
    }
    return -1;
  }
  // the window src.slice(a, a + w) as a regular expression sees it: [a, lim)
  int lim(int a, int w) const { int l = a + w; if (l > n) l = n; return l < a ? a : l; }
  // trim(): JavaScript's white space off both ends of [a, b)
  void trim(int &a, int &b) const {
    while (a < b && jsSpace(src[a])) a++;
    while (b > a && jsSpace(src[b - 1])) b--;
  }
  int32_t lookup(const Map &m, int a, int b) const { return m.get(src + a, (uint32_t)(b - a)); }
  bool has(const Map &m, int a, int b) const { return lookup(m, a, b) >= 0; }

  bool pushEnv(int a, int b) {
    if (envN == envCap) {
      int c = envCap ? envCap * 2 : 32;
      int *s = (int *)realloc(envS, c * sizeof(int));
      if (!s) return false;
      envS = s;
      int *e = (int *)realloc(envE, c * sizeof(int));
      if (!e) return false;
      envE = e; envCap = c;
    }
    envS[envN] = a; envE[envN] = b; envN++;
    return true;
  }
  bool envOpen(int a, int b) const {
    for (int k = 0; k < envN; k++)
      if (envE[k] - envS[k] == b - a && !memcmp(src + envS[k], src + a, (size_t)(b - a) * 2)) return true;
    return false;
  }

  void skipSpacesNoPar() {
    int j = i, nl = 0;
    while (j < n && isWS(src[j])) {
      if (src[j] == '\n') { nl++; if (nl > 1) return; }
      j++;
    }
    if (nl > 1) return;
    i = j;
  }
  int peekAfterSpaces() const {
    int j = i, nl = 0;
    while (j < n && isWS(src[j])) { if (src[j] == '\n') nl++; j++; }
    return nl > 1 ? -1 : j;
  }

  // /^\\end\s*\{([^}]*)\}/ on src.slice(k, k + 80): the name's [a, b) and the match's end
  bool endAt(int k, int &a, int &b, int &end) const {
    int l = lim(k, 80);
    if (!(k + 4 <= l && startsWith("\\end", k))) return false;
    int p = k + 4;
    while (p < l && jsSpace(src[p])) p++;
    if (p >= l || src[p] != '{') return false;
    int q = p + 1;
    while (q < l && src[q] != '}') q++;
    if (q >= l) return false;
    a = p + 1; b = q; end = q + 1;
    return true;
  }
  // /^\s*\{([^}]*)\}/ on src.slice(k, k + w)
  bool bracedAt(int k, int w, int &a, int &b, int &end) const {
    int l = lim(k, w);
    int p = k;
    while (p < l && jsSpace(src[p])) p++;
    if (p >= l || src[p] != '{') return false;
    int q = p + 1;
    while (q < l && src[q] != '}') q++;
    if (q >= l) return false;
    a = p + 1; b = q; end = q + 1;
    return true;
  }

  // Where a run of text that has begun at or before k goes on to: plain characters, and white
  // space with at most one line end (both of which only move i while text is open); it stops
  // before anything else, and before white space that holds a blank line (a par). In locals,
  // so the loop keeps them in registers.
  int textRun(int k) const {
    const char16_t *S = src;
    const int N = n;
    while (k < N) {
      int c = S[k];
      if (c >= 128 || KIND[c] == 0) { k++; continue; }
      if (KIND[c] == 2) return k;
      // white space: still text unless it holds a blank line
      int j = k, nl = 0;
      while (j < N) {
        int d = S[j];
        if (d == '\n') nl++;
        else if (d != ' ' && d != '\t' && d != '\r') break;
        j++;
      }
      if (nl >= 2) return k;
      k = j;
    }
    return k;
  }

  void text(int s, int e) { o.push(N_TEXT); o.push(s); o.push(e); }
  void special(int ch, int s, int e, bool err) { o.push(N_SPECIAL); o.push(ch); o.push(s); o.push(e); o.push(err ? 1 : 0); }

  // a list of nodes: its length first, written when known
  int parseSeq(int stop) {
    if (++depth > DEPTH) { bail = true; depth--; return 0; }
    int count = 0;
    int ts = -1;
    int prevT = 0, prevE = 0;
    auto flush = [&]() {
      if (ts >= 0 && ts < i) { text(ts, i); count++; prevT = N_TEXT; prevE = i; }
      ts = -1;
    };
    while (i < n && !bail) {
      int c = src[i];
      if (stop == STOP_BRACE && c == '}') break;
      if (stop == STOP_BRACKET && c == ']') break;
      if (c == '\\') {
        // Stop at \end{...} that closes this or an ancestor env.
        if (startsWith("\\end", i) && !isLetter(at(i + 4))) {
          int a, b, end;
          if (endAt(i, a, b, end)) {
            trim(a, b);
            if (envN && envOpen(a, b)) break;
          }
        }
        flush();
        NodeInfo r = parseCommand(false);
        count++; prevT = r.t; prevE = r.e;
        continue;
      }
      if (c == '{') { flush(); NodeInfo r = parseGroup(N_GROUP); count++; prevT = r.t; prevE = r.e; continue; }
      if (c == '}') { flush(); special('}', i, i + 1, true); count++; prevT = N_SPECIAL; prevE = i + 1; i++; continue; }
      if (c == '$') { flush(); NodeInfo r = parseDollar(); count++; prevT = r.t; prevE = r.e; continue; }
      if (c == '%') {
        flush();
        int j = i;
        while (j < n && src[j] != '\n') j++;
        if (j < n) {
          j++;
          while (j < n && (src[j] == ' ' || src[j] == '\t')) j++;
        }
        o.push(N_COMMENT); o.push(i); o.push(j);
        count++; prevT = N_COMMENT; prevE = j;
        i = j;
        continue;
      }
      if (c == '~' || c == '&' || c == '^' || c == '_' || c == '#') {
        flush(); special(c, i, i + 1, false); count++; prevT = N_SPECIAL; prevE = i + 1; i++; continue;
      }
      if (isWS(c)) {
        int j = i, nl = 0;
        while (j < n && isWS(src[j])) { if (src[j] == '\n') nl++; j++; }
        if (ts < 0 && count && prevT == N_COMMENT && at(prevE - 1) == '\n' && nl >= 1) nl++;
        if (nl >= 2) {
          flush();
          o.push(N_PAR); o.push(i); o.push(j); o.push(nl);
          count++; prevT = N_PAR; prevE = j;
          i = j;
          continue;
        }
        if (ts < 0) ts = i;
        i = textRun(j);
        continue;
      }
      if (ts < 0) ts = i;
      i = textRun(i + 1);
    }
    flush();
    depth--;
    return count;
  }

  // a group, as a node (N_GROUP) or as an argument (A_PLAIN): the same fields
  NodeInfo parseGroup(int tag) {
    int s = i;
    i++;
    o.push(tag); o.push(s);
    uint32_t pe = o.mark();
    o.push(s + 1);
    uint32_t pie = o.mark();
    uint32_t pn = o.mark();
    int cnt = parseSeq(STOP_BRACE);
    int e, ie = i;
    if (at(i) == '}') { i++; e = i; } else { e = i; }
    o.set(pe, e); o.set(pie, ie); o.set(pn, cnt);
    return { N_GROUP, e };
  }

  // a $ or $$ closes within MATH_SCAN code units or not at all (parser.js says why)
  int findClosingDollar(int from, bool dbl) const {
    int d = 0;
    const int end = from + MATH_SCAN < n ? from + MATH_SCAN : n;
    for (int j = from; j < end; j++) {
      int c = src[j];
      if (c == '\\') { j++; continue; }
      if (c == '{') d++;
      else if (c == '}') d--;
      else if (c == '%') { while (j < end && src[j] != '\n') j++; }
      else if (c == '\n') {
        int k = j + 1;
        while (k < n && (src[k] == ' ' || src[k] == '\t' || src[k] == '\r')) k++;
        if (at(k) == '\n') return -1;
      } else if (c == '$' && d <= 0) {
        if (dbl) { if (at(j + 1) == '$') return j; }
        else return j;
      }
    }
    return -1;
  }

  NodeInfo parseDollar() {
    int s = i;
    bool dbl = at(i + 1) == '$';
    int from = i + (dbl ? 2 : 1);
    int close = findClosingDollar(from, dbl);
    if (close < 0) { i = from; special(dbl ? CH_DD : '$', s, from, true); return { N_SPECIAL, from }; }
    i = close + (dbl ? 2 : 1);
    o.push(N_MATH); o.push(s); o.push(i); o.push(from); o.push(close); o.push(dbl ? 1 : 0); o.push(dbl ? 1 : 0);
    return { N_MATH, i };
  }

  // the arguments of sig, appended; argc is the count's place in the list. Returns whether
  // every argument is missing, and the largest end (for lastEnd).
  struct Args { bool allNull; int maxE; };
  // (no depth of its own: the lists it reads are counted by parseSeq, so DEPTH is 200 levels of
  // groups, environments and arguments alike)
  Args parseArgs(const char16_t *sig, uint32_t sl, uint32_t argc, Args acc) {
    for (uint32_t q = 0; q < sl && !bail; q++) {
      int kind = sig[q];
      int save = i;
      if (kind == 'o' || kind == 'p') {
        int open = kind == 'o' ? '[' : '(';
        int close = kind == 'o' ? ']' : ')';
        int j = peekAfterSpaces();
        if (j >= 0 && at(j) == open) {
          i = j;
          int s = i; i++;
          o.push(A_OPT); o.push(s);
          uint32_t pe = o.mark();
          o.push(s + 1);
          uint32_t pie = o.mark();
          uint32_t pn = o.mark();
          int cnt = 0;
          if (kind == 'o') cnt = parseSeq(STOP_BRACKET);
          else { while (i < n && src[i] != ')') i++; }
          int ie = i;
          if (at(i) == close) i++;
          o.set(pe, i); o.set(pie, ie); o.set(pn, cnt);
          o.inc(argc);
          acc.allNull = false;
          if (i > acc.maxE) acc.maxE = i;
        } else {
          o.push(A_NULL); o.inc(argc);
          i = save;
        }
      } else if (kind == 'm' || kind == 'v') {
        int j = peekAfterSpaces();
        if (j < 0 || j >= n) { o.push(A_NULL); o.inc(argc); continue; }
        i = j;
        if (src[i] == '{') {
          if (kind == 'v') {
            int s = i, d = 0, k = i;
            for (; k < n; k++) {
              if (src[k] == '\\') { k++; continue; }
              if (src[k] == '{') d++;
              else if (src[k] == '}') { d--; if (d == 0) break; }
            }
            i = k + 1 < n ? k + 1 : n;
            o.push(A_RAW); o.push(s); o.push(i); o.push(s + 1); o.push(k < n ? k : n);
            o.inc(argc);
            acc.allNull = false;
            if (i > acc.maxE) acc.maxE = i;
          } else {
            NodeInfo g = parseGroup(A_PLAIN);
            o.inc(argc);
            acc.allNull = false;
            if (g.e > acc.maxE) acc.maxE = g.e;
          }
        } else if (src[i] == '}' || src[i] == ']' || (src[i] == '\\' && startsWith("\\end", i) && !isLetter(at(i + 4)))) {
          o.push(A_NULL); o.inc(argc);
          i = save;
        } else if (src[i] == '\\') {
          int s = i;
          o.push(A_SINGLE); o.push(s);
          uint32_t pe = o.mark();
          o.push(s);
          uint32_t pie = o.mark();
          parseCommand(true);
          o.set(pe, i); o.set(pie, i);
          o.inc(argc);
          acc.allNull = false;
          if (i > acc.maxE) acc.maxE = i;
        } else {
          int s = i; i++;
          o.push(A_SINGLE); o.push(s); o.push(i); o.push(s); o.push(i);
          text(s, i);
          o.inc(argc);
          acc.allNull = false;
          if (i > acc.maxE) acc.maxE = i;
        }
      }
    }
    return acc;
  }
  Args parseArgs(const char *sig, uint32_t argc, Args acc) {
    char16_t w[8];
    uint32_t k = 0;
    for (; sig[k]; k++) w[k] = (unsigned char)sig[k];
    return parseArgs(w, k, argc, acc);
  }

  // a command node's head; its e, extra and argc are set later
  struct Head { uint32_t h, pe, px, pa; };
  Head head(int ns, int nameE, int s, int e, int ne, bool star) {
    Head r;
    r.h = o.n;
    o.push(N_CMD); o.push(ns); o.push(nameE); o.push(s);
    r.pe = o.mark(); o.set(r.pe, e);
    o.push(ne); o.push(star ? 1 : 0);
    r.px = o.mark();
    r.pa = o.mark();
    return r;
  }
  // lastEnd: the largest of ne, the arguments' ends and i; i moves up to the arguments' end
  int lastEnd(int ne, int maxE) {
    int e = ne > maxE ? ne : maxE;
    if (i < e) i = e;
    return e > i ? e : i;
  }

  NodeInfo parseCommand(bool noArgs) {
    int s = i;
    int j = i + 1;
    if (j >= n) { i = n; special('\\', s, n, true); return { N_SPECIAL, n }; }
    int ns = i + 1, nameE;
    bool word = isLetter(src[j]);
    if (word) {
      while (j < n && isLetter(src[j])) j++;
      nameE = j;
    } else {
      j++;
      nameE = j;
    }
    bool star = false;
    bool bs = !word && src[ns] == '\\';
    int32_t cls = lookup(NAMES, ns, nameE);
    if (cls < 0) cls = 0;
    if (at(j) == '*' && (word || bs) && !(cls & F_CHAR)) { star = true; j++; }
    int ne = j;
    i = j;
    if (word) skipSpacesNoPar();
    int ge = i;
    if (noArgs) { head(ns, nameE, s, ge, ne, star); return { N_CMD, ge }; }

    if (cls & F_BEGIN) return parseEnv(s);
    if (cls & F_END) {
      int a, b, end;
      bool m = bracedAt(i, 80, a, b, end);
      if (m) i = end;
      o.push(N_STRAY);
      if (m) { o.push(0); o.push(a); o.push(b); } else { o.push(3); o.push(0); o.push(0); }
      o.push(s); o.push(i); o.push(0);
      return { N_STRAY, i };
    }
    if (!word && (src[ns] == '(' || src[ns] == '[')) {
      bool paren = src[ns] == '(';
      char16_t closer[2] = { '\\', (char16_t)(paren ? ')' : ']') };
      int k = nextStr(paren ? seenParen : seenSquare, closer, 2, ne);
      if (k < 0) { i = ne; special(paren ? CH_PAREN : CH_BRACKET, s, ne, true); return { N_SPECIAL, ne }; }
      i = k + 2;
      o.push(N_MATH); o.push(s); o.push(i); o.push(ne); o.push(k); o.push(paren ? 0 : 1); o.push(paren ? 2 : 3);
      return { N_MATH, i };
    }
    if (cls & F_VERB) {
      int d = at(ne);
      if (d < 0 || isLetter(d) || isWS(d)) { i = ne; head(ns, nameE, s, ge, ne, star); return { N_CMD, ge }; }
      int k = indexOf(d, ne + 1);
      int end = k < 0 ? n : k;
      i = end + 1 < n ? end + 1 : n;
      o.push(N_VERB); o.push(s); o.push(i); o.push(ne + 1); o.push(end);
      return { N_VERB, i };
    }
    if (cls & F_DEF) return parseDef(ns, nameE, s, ge, ne, star);
    if (cls & F_ENVDEF) return parseEnvDef(ns, nameE, s, ge, ne, star);
    if (cls & F_TEXDEF)
      return parseTeXDef(ns, nameE, s, ge, ne, star);
    if (cls & F_LET) {
      Head h = head(ns, nameE, s, ge, ne, star);
      int g1a, g1b, g2a, g2b, end;
      if (letAt(ne, g1a, g1b, g2a, g2b, end)) {
        i = end;
        o.set(h.pe, i); o.set(h.px, X_DEF);
        o.push(D_LET); o.push(g1a); o.push(g1b); o.push(g2a); o.push(g2b);
        return { N_CMD, i };
      }
      return { N_CMD, ge };
    }
    if (cls & F_DMO) {
      Head h = head(ns, nameE, s, ge, ne, star);
      Args a = parseArgs("mm", h.pa, { true, -1 });
      int e = lastEnd(ne, a.maxE);
      o.set(h.pe, e); o.set(h.px, X_DEF);
      o.push(D_OP);
      return { N_CMD, e };
    }
    if (cls & F_NEWTHM) {
      Head h = head(ns, nameE, s, ge, ne, star);
      Args a = parseArgs(star ? "mm" : "momo", h.pa, { true, -1 });
      int e = lastEnd(ne, a.maxE);
      o.set(h.pe, e);
      return { N_CMD, e };
    }
    if (cls & F_DIM) {
      Head h = head(ns, nameE, s, ge, ne, star);
      int end = dimAt(ne);
      if (end >= 0) { i = end; o.set(h.pe, i); return { N_CMD, i }; }
      return { N_CMD, ge };
    }
    if ((cls & F_ACCENT) && (word ? nameE - ns == 1 : true)) {
      Head h = head(ns, nameE, s, ge, ne, star);
      o.set(h.px, X_ACCENT);
      int maxE = -1;
      if (!word) {
        if (at(i) == '{') {
          NodeInfo g = parseGroup(A_PLAIN);
          o.set(h.pa, 1);
          maxE = g.e;
        } else if (at(i) == '\\') {
          int s2 = i;
          o.push(A_SINGLE); o.push(s2);
          uint32_t pe = o.mark();
          o.push(s2);
          uint32_t pie = o.mark();
          parseCommand(true);
          o.set(pe, i); o.set(pie, i);
          o.set(h.pa, 1);
          maxE = i;
        } else if (i < n && !isWS(src[i])) {
          o.push(A_SINGLE); o.push(i); o.push(i + 1); o.push(i); o.push(i + 1);
          text(i, i + 1);
          o.set(h.pa, 1);
          maxE = i + 1;
          i++;
        }
      } else {
        Args a = parseArgs("m", h.pa, { true, -1 });
        maxE = a.maxE;
      }
      int e = lastEnd(ne, maxE);
      o.set(h.pe, e);
      return { N_CMD, e };
    }
    // the signature: parser.js's, else the document's own, \\ takes [..]
    const char16_t *sig = nullptr;
    uint32_t sl = 0;
    bool known = false;
    int32_t v = (cls & F_SIG) ? (cls >> 16) - 1 : -1;
    if (v < 0) v = lookup(USER, ns, nameE);
    if (v >= 0) { sig = sigs[v].p; sl = sigs[v].n; known = true; }
    if (bs) { static const char16_t O[1] = { 'o' }; sig = O; sl = 1; known = true; }
    if (!known && (cls & F_CHAR)) {
      // A character command takes no argument: an empty {} after it only ends its name
      i = ne;
      Head h = head(ns, nameE, s, ge, ne, star);
      if (at(i) == '{' && at(i + 1) == '}') {
        i += 2;
        o.push(A_PLAIN); o.push(ne); o.push(i); o.push(ne + 1); o.push(ne + 1); o.push(0);
        o.set(h.pa, 1);
        o.set(h.pe, i);
        return { N_CMD, i };
      }
      i = ge;
      return { N_CMD, ge };
    }
    if (!known) {
      // Unknown: attach directly adjacent {..} groups (no whitespace) only.
      Head h = head(ns, nameE, s, ge, ne, star);
      o.set(h.px, X_UNKNOWN);
      i = ne;
      int argsN = 0, maxE = -1;
      for (;;) {
        if (bail) break;
        int c = at(i);
        if (c == '{') {
          NodeInfo g = parseGroup(A_PLAIN);
          o.inc(h.pa); argsN++;
          if (g.e > maxE) maxE = g.e;
          continue;
        }
        if (c == '[' && argsN == 0) {
          int k = nextCh(seenBracket, ']', i);
          if (k > 0 && at(k + 1) == '{') {
            Args a = parseArgs("o", h.pa, { true, -1 });
            argsN++;
            if (a.maxE > maxE) maxE = a.maxE;
            continue;
          }
        }
        break;
      }
      if (argsN == 0) i = ge;
      int e = argsN ? lastEnd(ne, maxE) : ge;
      o.set(h.pe, e);
      return { N_CMD, e };
    }
    Head h = head(ns, nameE, s, ge, ne, star);
    int e = ge;
    int argsMax = -1;
    bool anyArg = false;
    if (sl) {
      int save = i;
      Args a = parseArgs(sig, sl, h.pa, { true, -1 });
      if (a.allNull) { i = save; e = ge; }
      else e = lastEnd(ne, a.maxE);
      argsMax = a.maxE;
      anyArg = !a.allNull;
    }
    (void)argsMax;
    o.set(h.pe, e);
    if ((cls & F_TIKZ) && anyArg && firstArgPresent(h)) {
      // \tikzstyle{name}=[keys] (or +=): the keys belong to the command, not to the text
      int end = tikzAt(i);
      if (end >= 0) {
        int k = matchBracket(end - 1) + 1;
        i = k < n ? k : n;
        e = i;
        o.set(h.pe, e);
      }
    }
    return { N_CMD, e };
  }
  // node.args[0] is not null: the first argument's kind, right after the head
  bool firstArgPresent(const Head &h) const { return h.pa + 1 < o.n && o.a[h.pa] > 0 && o.a[h.pa + 1] != A_NULL; }

  // /^\s*\\([A-Za-z]+|.)\s*=?\s*(\\[A-Za-z]+|\\.|[^\s])/ on src.slice(k, k + 120), with the
  // regular expression's backtracking: the groups' [a, b) and the match's end
  bool letAt(int k, int &g1a, int &g1b, int &g2a, int &g2b, int &end) const {
    int l = lim(k, 120);
    int p = k;
    while (p < l && jsSpace(src[p])) p++;
    if (p >= l || src[p] != '\\') return false;
    int a = p + 1;
    int L = 0;
    while (a + L < l && isLetter(src[a + L])) L++;
    // the first group: the letters, as many as can be, then fewer; then any one character
    for (int alt = 0; alt <= L + 1; alt++) {
      int q;
      if (alt < L) q = a + (L - alt);
      else if (alt == L) { if (!(a < l && jsDot(src[a]))) continue; q = a + 1; }
      else break;
      if (letRest(q, l, g2a, g2b, end)) { g1a = a; g1b = q; return true; }
    }
    return false;
  }
  bool letRest(int q, int l, int &g2a, int &g2b, int &end) const {
    int amax = 0;
    while (q + amax < l && jsSpace(src[q + amax])) amax++;
    for (int x = amax; x >= 0; x--) {
      int p = q + x;
      int eqs[2], ne = 0;
      if (p < l && src[p] == '=') eqs[ne++] = 1;
      eqs[ne++] = 0;
      for (int t = 0; t < ne; t++) {
        int p2 = p + eqs[t];
        int bmax = 0;
        while (p2 + bmax < l && jsSpace(src[p2 + bmax])) bmax++;
        for (int y = bmax; y >= 0; y--) {
          int r = p2 + y;
          if (r >= l) continue;
          if (src[r] == '\\' && r + 1 < l && isLetter(src[r + 1])) {
            int z = r + 1;
            while (z < l && isLetter(src[z])) z++;
            g2a = r; g2b = z; end = z; return true;
          }
          if (src[r] == '\\' && r + 1 < l && jsDot(src[r + 1])) { g2a = r; g2b = r + 2; end = r + 2; return true; }
          if (!jsSpace(src[r])) { g2a = r; g2b = r + 1; end = r + 1; return true; }
        }
      }
    }
    return false;
  }

  // a unit of the list at p within l: its length, 0 when none
  int unitAt(int p, int l, const char *const *units) const {
    for (int u = 0; units[u]; u++) {
      const char *w = units[u];
      int q = 0;
      while (w[q] && p + q < l && src[p + q] == (unsigned char)w[q]) q++;
      if (!w[q]) return q;
    }
    return 0;
  }
  // -?[\d.]+\s*(unit): its end, -1 when it does not match at p
  int numUnit(int p, int l, const char *const *units) const {
    if (p < l && src[p] == '-') {
      int r = numUnitNoSign(p + 1, l, units);
      if (r >= 0) return r;
    }
    return numUnitNoSign(p, l, units);
  }
  int numUnitNoSign(int p, int l, const char *const *units) const {
    int q = p;
    while (q < l && ((src[q] >= '0' && src[q] <= '9') || src[q] == '.')) q++;
    if (q == p) return -1;
    while (q < l && jsSpace(src[q])) q++;
    int u = unitAt(q, l, units);
    return u ? q + u : -1;
  }
  // \s*word\s*-?[\d.]+\s*(unit): its end, -1 when absent
  int glue(int p, int l, const char *word, const char *const *units) const {
    int q = p;
    while (q < l && jsSpace(src[q])) q++;
    for (int k = 0; word[k]; k++, q++) if (q >= l || src[q] != (unsigned char)word[k]) return -1;
    while (q < l && jsSpace(src[q])) q++;
    return numUnit(q, l, units);
  }
  // the dimension after \vskip and the like: its end, or -1
  int dimAt(int k) const {
    static const char *const U1[] = { "pt", "em", "ex", "in", "cm", "mm", "bp", "pc", "dd", "cc", "sp", "mu", nullptr };
    static const char *const U2[] = { "fill", "fil", "pt", "em", "ex", "in", "cm", "mm", "mu", nullptr };
    static const char *const U3[] = { "pt", "em", "ex", "in", "cm", "mm", "mu", nullptr };
    int l = lim(k, 120);
    int p = k;
    while (p < l && jsSpace(src[p])) p++;
    int q = numUnit(p, l, U1);
    if (q < 0) {
      if (p < l && src[p] == '\\' && p + 1 < l && isLetter(src[p + 1])) {
        q = p + 1;
        while (q < l && isLetter(src[q])) q++;
      } else return -1;
    }
    int r = glue(q, l, "plus", U2);
    if (r >= 0) q = r;
    r = glue(q, l, "minus", U3);
    if (r >= 0) q = r;
    return q;
  }
  // /^\s*\+?=\s*\[/ on src.slice(k, k + 40): the match's end (one past the [), or -1
  int tikzAt(int k) const {
    int l = lim(k, 40);
    int p = k;
    while (p < l && jsSpace(src[p])) p++;
    if (p < l && src[p] == '+' && p + 1 < l && src[p + 1] == '=') p += 2;
    else if (p < l && src[p] == '=') p += 1;
    else return -1;
    while (p < l && jsSpace(src[p])) p++;
    if (p < l && src[p] == '[') return p + 1;
    return -1;
  }

  // ([A-Za-z]+|.) at a, then the rest: the letters as many as can be, then fewer, then one
  // character; rest(q) is the end of a match from q or -1
  template <class F>
  bool nameThen(int a, int l, int &ga, int &gb, int &end, F rest) const {
    int L = 0;
    while (a + L < l && isLetter(src[a + L])) L++;
    for (int x = L; x >= 1; x--) { int r = rest(a + x); if (r >= 0) { ga = a; gb = a + x; end = r; return true; } }
    if (a < l && jsDot(src[a])) { int r = rest(a + 1); if (r >= 0) { ga = a; gb = a + 1; end = r; return true; } }
    return false;
  }

  NodeInfo parseDef(int ns, int nameE, int s, int ge, int ne, bool star) {
    Head h = head(ns, nameE, s, ge, ne, star);
    // /^\s*(?:\{\s*\\([A-Za-z]+|.)\s*\}|\\([A-Za-z]+|.))/ on src.slice(ne, ne + 200)
    int l = lim(ne, 200);
    int p = ne;
    while (p < l && jsSpace(src[p])) p++;
    int ga = 0, gb = 0, end = -1;
    bool m = false;
    if (p < l && src[p] == '{') {
      int q = p + 1;
      while (q < l && jsSpace(src[q])) q++;
      if (q < l && src[q] == '\\')
        m = nameThen(q + 1, l, ga, gb, end, [&](int r) { while (r < l && jsSpace(src[r])) r++; return r < l && src[r] == '}' ? r + 1 : -1; });
    }
    if (!m && p < l && src[p] == '\\') m = nameThen(p + 1, l, ga, gb, end, [](int r) { return r; });
    if (!m) { i = ne; return { N_CMD, ge }; }
    i = end;
    int nmode = 0, na = 0, nb = 0, da = -1, db = -1;
    int j = peekAfterSpaces();
    if (j >= 0 && at(j) == '[') {
      int k = nextCh(seenBracket, ']', j);
      if (k > 0) { nmode = 1; na = j + 1; nb = k; i = k + 1; }
    }
    j = peekAfterSpaces();
    if (j >= 0 && at(j) == '[') { int k = matchBracket(j); da = j + 1; db = k; i = k + 1; }
    j = peekAfterSpaces();
    int bs = -1, be = -1;
    if (j >= 0 && at(j) == '{') { i = j; int k = matchBrace(j); bs = j + 1; be = k; i = k + 1 < n ? k + 1 : n; }
    o.set(h.pe, i); o.set(h.px, X_DEF);
    o.push(D_CMD); o.push(ga); o.push(gb); o.push(nmode); o.push(na); o.push(nb); o.push(da); o.push(db); o.push(bs); o.push(be);
    return { N_CMD, i };
  }

  NodeInfo parseEnvDef(int ns, int nameE, int s, int ge, int ne, bool star) {
    Head h = head(ns, nameE, s, ge, ne, star);
    int a, b, end;
    if (!bracedAt(ne, 200, a, b, end)) { i = ne; return { N_CMD, ge }; }
    i = end;
    int nmode = 0, na = 0, nb = 0;
    int j = peekAfterSpaces();
    if (j >= 0 && at(j) == '[') {
      int k = nextCh(seenBracket, ']', j);
      if (k > 0) { nmode = 1; na = j + 1; nb = k; i = k + 1; }
    }
    j = peekAfterSpaces();
    if (j >= 0 && at(j) == '[') { int k = matchBracket(j); i = k + 1; }
    int pa[2] = { -1, -1 }, pb[2] = { -1, -1 }, parts = 0;
    for (int t = 0; t < 2; t++) {
      j = peekAfterSpaces();
      if (j >= 0 && at(j) == '{') { int k = matchBrace(j); pa[parts] = j + 1; pb[parts] = k; parts++; i = k + 1 < n ? k + 1 : n; }
    }
    trim(a, b);
    o.set(h.pe, i); o.set(h.px, X_DEF);
    o.push(D_ENV); o.push(a); o.push(b); o.push(nmode); o.push(na); o.push(nb); o.push(pa[0]); o.push(pb[0]); o.push(pa[1]); o.push(pb[1]);
    return { N_CMD, i };
  }

  NodeInfo parseTeXDef(int ns, int nameE, int s, int ge, int ne, bool star) {
    Head h = head(ns, nameE, s, ge, ne, star);
    // /^\s*\\([A-Za-z]+|.)((?:\s*#\d)*)\s*/ on src.slice(ne, ne + 200): what follows the name
    // matches nothing at worst, so the name is the letters, as many as there are, or one character
    int l = lim(ne, 200);
    int p = ne;
    while (p < l && jsSpace(src[p])) p++;
    if (!(p < l && src[p] == '\\')) { i = ne; return { N_CMD, ge }; }
    int a = p + 1, q = a;
    while (q < l && isLetter(src[q])) q++;
    if (q == a) { if (a < l && jsDot(src[a])) q = a + 1; else { i = ne; return { N_CMD, ge }; } }
    int nargs = 0, r = q;
    for (;;) {
      int t = r;
      while (t < l && jsSpace(src[t])) t++;
      if (t + 1 < l && src[t] == '#' && src[t + 1] >= '0' && src[t + 1] <= '9') { nargs++; r = t + 2; }
      else break;
    }
    while (r < l && jsSpace(src[r])) r++;
    i = r;
    int bs = -1, be = -1;
    if (at(i) == '{') { int k = matchBrace(i); bs = i + 1; be = k; i = k + 1 < n ? k + 1 : n; }
    o.set(h.pe, i); o.set(h.px, X_DEF);
    o.push(D_CMD); o.push(a); o.push(q); o.push(0); o.push(nargs); o.push(0); o.push(-1); o.push(-1); o.push(bs); o.push(be);
    return { N_CMD, i };
  }

  int matchBrace(int j) const {
    int d = 0;
    for (int k = j; k < n; k++) {
      int c = src[k];
      if (c == '\\') { k++; continue; }
      if (c == '%') { while (k < n && src[k] != '\n') k++; continue; }
      if (c == '{') d++;
      else if (c == '}') { d--; if (d == 0) return k; }
    }
    return n;
  }
  int matchBracket(int j) const {
    int d = 0;
    for (int k = j + 1; k < n; k++) {
      int c = src[k];
      if (c == '\\') { k++; continue; }
      if (c == '{') d++;
      else if (c == '}') d--;
      else if (c == ']' && d == 0) return k;
    }
    return n;
  }

  // /\\end\s*\{\s*NAME\s*\}/g from be: the first match's start and end
  bool endLoose(int from, int a, int b, int &ms, int &me) const {
    int m = b - a;
    for (int k = from < 0 ? 0 : from; k + 4 <= n; k++) {
      if (!(src[k] == '\\' && startsWith("\\end", k))) continue;
      int p = k + 4;
      while (p < n && jsSpace(src[p])) p++;
      if (at(p) != '{') continue;
      p++;
      while (p < n && jsSpace(src[p])) p++;
      if (p + m > n || memcmp(src + p, src + a, (size_t)m * 2)) continue;
      p += m;
      while (p < n && jsSpace(src[p])) p++;
      if (at(p) != '}') continue;
      ms = k; me = p + 1;
      return true;
    }
    return false;
  }

  NodeInfo parseEnv(int s) {
    int a, b, end;
    if (!bracedAt(i, 120, a, b, end)) {
      o.push(N_STRAY); o.push(2); o.push(0); o.push(0); o.push(s); o.push(i); o.push(0);
      return { N_STRAY, i };
    }
    trim(a, b);
    i = end;
    int nameEnd = i;
    int32_t sv = lookup(ENV_SIG, a, b);
    const char16_t *sig = nullptr;
    uint32_t sl = 0;
    if (sv >= 0) { sig = sigs[sv].p; sl = sigs[sv].n; }
    bool math = has(MATH_ENVS, a, b);
    uint32_t start = o.n;
    o.push(N_ENV); o.push(a); o.push(b); o.push(s);
    uint32_t pe = o.mark();
    o.push(s);
    uint32_t pbe = o.mark(), pes = o.mark();
    o.push(nameEnd);
    uint32_t praw = o.mark();
    o.push(math ? 1 : 0);
    uint32_t pa = o.mark();
    if (math || has(RAW_ENVS, a, b) || userRawEnv(a, b)) {
      o.set(praw, 1);
      if (sliceIs(a, b, "alignat") || sliceIs(a, b, "alignat*")) parseArgs("m", pa, { true, -1 });
      else if (sliceIs(a, b, "minted")) parseArgs("om", pa, { true, -1 });
      else if (sliceIs(a, b, "lstlisting") || sliceIs(a, b, "Verbatim")) { if (at(i) == '[') parseArgs("o", pa, { true, -1 }); }
      int be = i;
      int m = b - a;
      bool plainName = true;
      for (int q = a; q < b; q++) if (!nameCh(src[q])) { plainName = false; break; }
      if (plainName) {
        // the index of every \end (parser.js's rawEnd)
        if (!ixBuilt && !buildEndIndex()) { bail = true; return { N_ENV, i }; }
        int32_t id = ixNames.get(src + a, (uint32_t)m);
        int k = -1, len = 0;
        if (id >= 0) {
          int x = atOrAfter(xPos, xOff[id], xOff[id + 1], be);
          if (x < xOff[id + 1]) { k = xPos[x]; len = m + 6; }
          else {
            int l = atOrAfter(lPos, lOff[id], lOff[id + 1], be);
            if (l < lOff[id + 1]) { k = lPos[l]; len = lLen[l]; }
          }
        }
        if (k < 0) {
          i = be;
          o.truncate(start);
          o.push(N_STRAY); o.push(1); o.push(a); o.push(b); o.push(s); o.push(be); o.push(1);
          return { N_STRAY, be };
        }
        i = k + len;
        o.set(pe, i); o.set(pbe, be); o.set(pes, k);
        return { N_ENV, i };
      }
      // another name: '\\end{' + name + '}', then \end { name }
      char16_t *closer = (char16_t *)malloc((size_t)(m + 6) * 2);
      if (!closer) { bail = true; return { N_ENV, i }; }
      const char *head5 = "\\end{";
      for (int q = 0; q < 5; q++) closer[q] = (unsigned char)head5[q];
      memcpy(closer + 5, src + a, (size_t)m * 2);
      closer[5 + m] = '}';
      int es = envSeenOf(a, b);
      if (es < 0) { free(closer); bail = true; return { N_ENV, i }; }
      int k = nextStr(envSeen[es].exact, closer, m + 6, be);
      free(closer);
      if (k < 0) {
        Seen &L = envSeen[es].loose;
        if (!known(L, be)) {
          int ms, me;
          L.from = be;
          if (endLoose(be, a, b, ms, me)) { L.found = ms; envSeen[es].looseLen = me - ms; }
          else L.found = -1;
        }
        if (L.found >= 0) { k = L.found; i = k + envSeen[es].looseLen; }
        else {
          // no end: a stray begin; the arguments read are dropped with the environment
          i = be;
          o.truncate(start);
          o.push(N_STRAY); o.push(1); o.push(a); o.push(b); o.push(s); o.push(be); o.push(1);
          return { N_STRAY, be };
        }
      } else i = k + m + 6;
      o.set(pe, i); o.set(pbe, be); o.set(pes, k);
      return { N_ENV, i };
    }
    if (!(sv >= 0 && sl > 0) && !has(PLAIN_ENVS, a, b)) { static const char16_t O[1] = { 'o' }; sig = O; sl = 1; }
    if (sl) parseArgs(sig, sl, pa, { true, -1 });
    int be = i;
    if (!pushEnv(a, b)) { bail = true; return { N_ENV, i }; }
    uint32_t pn = o.mark();
    int cnt = parseSeq(STOP_NONE);
    envN--;
    int es = i, e = i;
    int ma, mb, mend;
    if (endAt(i, ma, mb, mend)) {
      trim(ma, mb);
      if (mb - ma == b - a && !memcmp(src + ma, src + a, (size_t)(b - a) * 2)) { i = mend; e = i; }
    }
    o.set(pe, e); o.set(pbe, be); o.set(pes, es); o.set(pn, cnt);
    return { N_ENV, e };
  }
  bool userRawEnv(int a, int b) const {
    // userSigs[' rawenv:' + name], truthy
    int m = b - a;
    char16_t buf[136];
    if (m > 128) return false;
    const char *pre = " rawenv:";
    for (int q = 0; q < 8; q++) buf[q] = (unsigned char)pre[q];
    memcpy(buf + 8, src + a, (size_t)m * 2);
    int32_t v = USER.get(buf, (uint32_t)(m + 8));
    return v >= 0 && sigs[v].n > 0;
  }

  void run() {
    uint32_t pn = o.mark();
    int cnt = parseSeq(STOP_NONE);
    // Anything left (stray closers) becomes errors.
    while (i < n && !bail) {
      special(src[i], i, i + 1, true);
      cnt++;
      i++;
      cnt += parseSeq(STOP_NONE);
    }
    o.set(pn, cnt);
  }
};

Out out;
Text input;

}  // namespace

// The tables of parser.js (src/native.js writes them into core_text first). 1 when read.
CORE_EXPORT(core_parse_tables) int core_parse_tables(uint32_t n) {
  tablesOk = false;
  Map *maps[] = { &SIG, &CHARS, &ACCENTS, &ENV_SIG, &MATH_ENVS, &RAW_ENVS, &DEF_CMDS, &ENV_DEF, &DIM_CMDS, &PLAIN_ENVS };
  const bool values[] = { true, false, false, true, false, false, false, false, false, false };
  for (Map *m : maps) m->clear();
  USER.clear();
  NAMES.clear();
  nsigs = nsigsTables = 0;
  // keep the text: the maps point into it
  char16_t *t = tablesText.ensure(n);
  if (!t && n) return 0;
  memcpy(t, input.p, (size_t)n * 2);
  const char16_t *p = t, *end = t + n;
  for (int sec = 0; sec < 10; sec++) {
    const char16_t *e = p;
    while (e < end && *e != 3) e++;
    if (!readSection(p, e, *maps[sec], values[sec])) return 0;
    p = e < end ? e + 1 : end;
  }
  NAMES.clear();
  if (!addAll(SIG, F_SIG, true) || !addAll(CHARS, F_CHAR, false) || !addAll(ACCENTS, F_ACCENT, false) || !addAll(DEF_CMDS, F_DEF, false) ||
      !addAll(ENV_DEF, F_ENVDEF, false) || !addAll(DIM_CMDS, F_DIM, false)) return 0;
  // parseCommand's own names, from ASCII literals into text the map can point at
  uint32_t total = 0;
  for (const Named &d : NAMED) total += (uint32_t)strlen(d.name);
  char16_t *q = namedText.ensure(total);
  if (!q) return 0;
  for (const Named &d : NAMED) {
    uint32_t m = (uint32_t)strlen(d.name);
    for (uint32_t k = 0; k < m; k++) q[k] = (unsigned char)d.name[k];
    if (!addFlags(q, m, d.flag)) return 0;
    q += m;
  }
  nsigsTables = nsigs;
  tablesOk = true;
  return 1;
}

// The document's own signatures (userSigs), in the same form as one section. 1 when read.
CORE_EXPORT(core_parse_user) int core_parse_user(uint32_t n) {
  USER.clear();
  // the document's signatures follow the tables' and replace the last document's
  nsigs = nsigsTables;
  char16_t *t = userText.ensure(n);
  if (!t && n) return 0;
  memcpy(t, input.p, (size_t)n * 2);
  return readSection(t, t + n, USER, true) ? 1 : 0;
}

// Room for n code units of text; src/native.js writes them there.
CORE_EXPORT(core_text) char16_t *core_text(uint32_t n) { return input.ensure(n); }

// The same text as UTF-8 (TextEncoder.encodeInto writes a well formed string many times faster
// than a loop of charCodeAt): room for n bytes, then core_utf8 makes them the code units of
// core_text. Returns how many there are, or -1 if the bytes are not UTF-8 as encodeInto writes it.
Text bytes8;
CORE_EXPORT(core_text8) uint8_t *core_text8(uint32_t n) { return (uint8_t *)bytes8.ensure((n + 1) / 2); }
CORE_EXPORT(core_utf8) int32_t core_utf8(uint32_t nb, uint32_t units) {
  const uint8_t *b = (const uint8_t *)bytes8.p;
  char16_t *u = input.ensure(units);
  if ((!u && units) || nb > bytes8.n * 2) return -1;
  uint32_t k = 0, q = 0;
  while (k < nb) {
    uint32_t c = b[k];
    if (c < 0x80) { if (q >= units) return -1; u[q++] = (char16_t)c; k++; continue; }
    uint32_t cp, len;
    if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; len = 2; }
    else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; len = 3; }
    else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; len = 4; }
    else return -1;
    if (k + len > nb) return -1;
    for (uint32_t t = 1; t < len; t++) {
      uint32_t d = b[k + t];
      if ((d & 0xC0) != 0x80) return -1;
      cp = (cp << 6) | (d & 0x3F);
    }
    k += len;
    if (cp >= 0x10000) {
      if (q + 2 > units) return -1;
      cp -= 0x10000;
      u[q++] = (char16_t)(0xD800 + (cp >> 10));
      u[q++] = (char16_t)(0xDC00 + (cp & 0x3FF));
    } else {
      if (q >= units) return -1;
      u[q++] = (char16_t)cp;
    }
  }
  return q == units ? (int32_t)q : -1;
}

// Parses the n code units in core_text: the list's length, or -1 when JavaScript must parse.
CORE_EXPORT(core_parse) int32_t core_parse(uint32_t n) {
  if (!tablesOk || n > input.n) return -1;
  out.n = 0; out.bad = false;
  out.reserve(1024 + n / 4);
  if (out.bad) return -1;
  Parser P(input.p, (int)n, out);
  P.run();
  if (P.bail || out.bad) return -1;
  return (int32_t)out.n;
}

// Where the list is.
CORE_EXPORT(core_out) int32_t *core_out() { return out.a; }
