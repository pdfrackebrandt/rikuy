// Harper (tex/vendor/harper/, Automattic's English grammar checker in its own WebAssembly build)
// behind two calls: start it from the module's bytes, and lint a text. Used by the grammar worker
// (src/spell/grammar.js) and by the tests under node. The bytes come checked by their SHA-256
// (the worker's get): Harper's glue fetches its module by address, so that one address, which no
// server has, is answered from those bytes and nothing is fetched.
import { createBinaryModuleFromUrl } from '../../tex/vendor/harper/BinaryModule-DMhzYB6c.js';
import { LocalLinter } from '../../tex/vendor/harper/index.js';

const ADDRESS = 'https://harper.rikuy.invalid/harper_wasm_slim_bg.wasm';
// Spelling is Hunspell's; a paragraph after a displayed equation starts in lower case ("where x
// is …"); long sentences are an academic paper's own: those three of Harper's rules stay off.
const OFF = ['SpellCheck', 'SentenceCapitalization', 'LongSentences'];
// what Harper calls the dialects of English (its Dialect enum)
export const DIALECT = { en_US: 0, en_GB: 1 };
// kinds of lint that are spelling, which Hunspell marks already
const SPELLING = /^(Spelling)$/;

let bytes = null;
const linters = new Map();
export function harperBytes(b) {
  bytes = b;
  if (!globalThis.__rikuyHarperFetch) {
    const real = globalThis.fetch;
    globalThis.__rikuyHarperFetch = true;
    globalThis.fetch = (u, o) => (String(u && u.url ? u.url : u) === ADDRESS ? Promise.resolve(new Response(bytes, { headers: { 'Content-Type': 'application/wasm' } })) : real(u, o));
  }
}
async function linter(dialect) {
  let L = linters.get(dialect);
  if (!L) {
    L = (async () => {
      const x = new LocalLinter({ binary: createBinaryModuleFromUrl(ADDRESS, 'slim'), dialect });
      await x.setup();
      const cfg = await x.getLintConfig();
      for (const k of OFF) if (k in cfg) cfg[k] = false;
      await x.setLintConfig(cfg);
      return x;
    })();
    linters.set(dialect, L);
  }
  return L;
}

// the lints of a text: [{s, e, kind, msg, sugg: [{kind: 'replace'|'remove'|'insert', text}]}],
// offsets in UTF-16 code units of text (as harper.js gives them: checked with a text holding
// characters past U+FFFF in test/spell.test.mjs)
export async function lintText(text, dialect = 0) {
  const L = await linter(dialect);
  const out = [];
  for (const l of await L.lint(text, { language: 'plaintext' })) {
    const kind = l.lint_kind();
    if (SPELLING.test(kind)) continue;
    const sp = l.span();
    const s = sp.start, e = sp.end;
    const sugg = l.suggestions().slice(0, 6).map((x) => ({ kind: ['replace', 'remove', 'insert'][x.kind()] || 'replace', text: x.get_replacement_text() }));
    out.push({ s, e, kind, msg: l.message(), sugg });
    if (out.length >= 2000) break;
  }
  return out;
}
