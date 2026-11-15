// Rikuy's spelling: Hunspell behind a few C functions the spell worker (src/spell/worker.js)
// calls. Words go in and out as UTF-8; build_tools.sh ships only dictionaries whose .aff says
// SET UTF-8, so no conversion happens here. A dictionary is opened from the worker's in-memory
// files (Emscripten's FS), one Hunspell per language, at most eight at a time.
//
// Checking is the hot path: a document's distinct words go over as one buffer, one per line,
// and come back as one byte each ('1' known, '0' not), so a 141 KB paper is one call, not
// thousands. Suggestions and the words a person adds are one word a call.
#include <emscripten.h>
#include <string>
#include <vector>
#include "hunspell.hxx"

static const int SLOTS = 8;
static Hunspell* dicts[SLOTS];
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

}
