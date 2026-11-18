// Rikuy's spelling: Hunspell behind a few C functions the spell worker (src/spell/worker.js)
// calls. Words go in and out as UTF-8; build_tools.sh ships only dictionaries whose .aff says
// SET UTF-8, so no conversion happens here. A dictionary is opened from the worker's in-memory
// files (Emscripten's FS), one Hunspell per language, at most eight at a time.
//
// Checking is the hot path: a document's distinct words go over as one buffer, one per line,
// and come back as one byte each ('1' known, '0' not), so a 141 KB paper is one call, not
// thousands. Suggestions and the words a person adds are one word a call.
//
// The thesaurus is MyThes (LibreOffice's), unchanged: one per language beside its Hunspell, which
// gives the stems of an inflected word ("running", "Häuser") so its entry ("run", "haus") is found
// as LibreOffice finds it. MyThes reads its index whole and its data with fseek and fgets: the
// worker serves the data from the pieces it has fetched (src/spell/worker.js), so a lookup reads
// the megabyte or two its entry is in, not the whole 18 to 29 MB file.
#include <emscripten.h>
#include <string>
#include <vector>
#include "hunspell.hxx"
#include "mythes.hxx"

static const int SLOTS = 8;
static Hunspell* dicts[SLOTS];
static MyThes* thes[SLOTS];
static bool latin1[SLOTS];   // a thesaurus whose files are ISO8859-1 (es_ES's): words converted
static std::string out;   // the last result, valid until the next call

extern "C" {

// open the dictionary at aff and dic (paths in the worker's FS): its slot, or -1
EMSCRIPTEN_KEEPALIVE int spell_open(const char* aff, const char* dic) {
  for (int i = 0; i < SLOTS; i++) {
    if (dicts[i]) continue;
    Hunspell* h = new Hunspell(aff, dic);
    // (an .aff in another encoding would need its words converted: refused instead)
    if (h->get_dict_encoding() != "UTF-8") { delete h; return -1; }
    dicts[i] = h;
    return i;
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE void spell_close(int h) {
  if (h < 0 || h >= SLOTS || !dicts[h]) return;
  delete dicts[h];
  dicts[h] = nullptr;
}

// words: n bytes, each word ended by '\n'. Returns one byte a word, '1' or '0', NUL ended.
EMSCRIPTEN_KEEPALIVE const char* spell_check_list(int h, const char* words, int n) {
  out.clear();
  if (h < 0 || h >= SLOTS || !dicts[h]) return out.c_str();
  std::string w;
  for (int i = 0, a = 0; i < n; i++) {
    if (words[i] != '\n') continue;
    w.assign(words + a, i - a);
    out.push_back(dicts[h]->spell(w) ? '1' : '0');
    a = i + 1;
  }
  return out.c_str();
}

// suggestions for one word, each ended by '\n'
EMSCRIPTEN_KEEPALIVE const char* spell_suggest(int h, const char* word) {
  out.clear();
  if (h < 0 || h >= SLOTS || !dicts[h]) return out.c_str();
  for (const std::string& s : dicts[h]->suggest(std::string(word))) { out += s; out.push_back('\n'); }
  return out.c_str();
}

// a word the person keeps (Add to Dictionary, a document's own word list): known from now on
EMSCRIPTEN_KEEPALIVE int spell_add(int h, const char* word) {
  if (h < 0 || h >= SLOTS || !dicts[h]) return -1;
  return dicts[h]->add(std::string(word));
}

EMSCRIPTEN_KEEPALIVE int spell_remove(int h, const char* word) {
  if (h < 0 || h >= SLOTS || !dicts[h]) return -1;
  return dicts[h]->remove(std::string(word));
}

// the stems Hunspell finds for a word, each ended by '\n' (none for a word it does not know)
EMSCRIPTEN_KEEPALIVE const char* spell_stem(int h, const char* word) {
  out.clear();
  if (h < 0 || h >= SLOTS || !dicts[h]) return out.c_str();
  for (const std::string& s : dicts[h]->stem(std::string(word))) { out += s; out.push_back('\n'); }
  return out.c_str();
}

// open the thesaurus at idx and dat (paths in the worker's FS): its slot, or -1
EMSCRIPTEN_KEEPALIVE int thes_open(const char* idx, const char* dat) {
  for (int i = 0; i < SLOTS; i++) {
    if (thes[i]) continue;
    MyThes* t = new MyThes(idx, dat);
    const char* enc = t->get_th_encoding();
    if (!enc) { delete t; return -1; }
    std::string e(enc);
    if (e != "UTF-8" && e != "ISO8859-1") { delete t; return -1; }
    thes[i] = t;
    latin1[i] = e == "ISO8859-1";
    return i;
  }
  return -1;
}

// UTF-8 to ISO8859-1 and back, for a thesaurus in ISO8859-1: false where a character has no
// place in it (that word is in no entry)
static bool toLatin1(const std::string& u, std::string& l) {
  l.clear();
  for (size_t i = 0; i < u.size(); i++) {
    unsigned char c = u[i];
    if (c < 0x80) l.push_back(c);
    else if ((c == 0xC2 || c == 0xC3) && i + 1 < u.size()) l.push_back((char)(((c & 0x03) << 6) | (u[++i] & 0x3F)));
    else return false;
  }
  return true;
}
static void fromLatin1(const char* l, std::string& u) {
  for (; *l; l++) {
    unsigned char c = *l;
    if (c < 0x80) u.push_back(c); else { u.push_back((char)(0xC0 | (c >> 6))); u.push_back((char)(0x80 | (c & 0x3F))); }
  }
}

// The entry of one headword (as the index has it: lower case), as text: one meaning a line, its
// terms separated by tabs, the first the part of speech as the data gives it ("(noun)"), then the
// meaning's terms ("The Hague", "Den Haag", "city (generic term)"). Empty when there is none, or
// when the data it needs has not been fetched yet (the worker fetches it and asks again).
EMSCRIPTEN_KEEPALIVE const char* thes_lookup(int t, const char* word) {
  out.clear();
  if (t < 0 || t >= SLOTS || !thes[t]) return out.c_str();
  std::string w(word), l;
  if (latin1[t]) { if (!toLatin1(w, l)) return out.c_str(); w = l; }
  if (w.empty() || w.size() >= MAX_WD_LEN) return out.c_str();
  mentry* pm = nullptr;
  int n = thes[t]->Lookup(w.c_str(), (int)w.size(), &pm);
  for (int i = 0; i < n; i++) {
    const mentry& m = pm[i];
    // (MyThes puts the part of speech before the first term: "(noun) The Hague")
    std::string pos;
    if (m.defn && m.count > 0 && m.psyns[0]) {
      std::string d(m.defn), first(m.psyns[0]);
      if (d.size() > first.size() + 1) pos = d.substr(0, d.size() - first.size() - 1);
    }
    if (latin1[t]) { std::string u; fromLatin1(pos.c_str(), u); out += u; } else out += pos;
    for (int k = 0; k < m.count; k++) {
      out.push_back('\t');
      if (!m.psyns[k]) continue;
      if (latin1[t]) fromLatin1(m.psyns[k], out); else out += m.psyns[k];
    }
    out.push_back('\n');
  }
  if (n) thes[t]->CleanUpAfterLookup(&pm, n);
  return out.c_str();
}

}
