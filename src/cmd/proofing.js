// Round 3, R4: the Thesaurus and grammar, beside spelling (src/cmd/review.js).
//
// Thesaurus. MyThes, LibreOffice's thesaurus, is in the spell worker's module with Hunspell
// (tex/build_tools.sh hunspell, tex/native/spell/spell.cc): Hunspell gives an inflected word's stems
// and MyThes the entry of the first one it has, as LibreOffice looks words up. The data (WordNet's
// English, OpenThesaurus's German, LibreOffice's Spanish) is fetched only when a word of that
// language is looked up, piece by piece (src/spell/worker.js). Shift+F7 opens the Thesaurus pane
// (src/ui/thespane.js); the right click menu's Synonyms lists the first words and opens it too.
// A word put in replaces the one at the cursor by its letters that differ (the edit spelling's
// Change makes), its capitals as the old word had them, one step of history.
//
// Grammar. Harper (tex/vendor/harper/, its own WebAssembly build, Apache-2.0) in a worker of its
// own (src/spell/grammar.js), English only, reading the page's prose as spelling does
// (grammarBlocks in src/spell/words.js: a formula, a citation or a reference stands as "x", code
// and other languages are left out). Off until "Check Grammar as You Type" is turned on (the
// Spelling button's arrow, Review › Proofing): Harper is 20 MB to fetch and about 150 MB of memory
// once started, more than a document that never asks should cost (PLAN.md task 64). On, an issue
// gets a blue double line; the right click menu, a long press and the Spelling and Grammar pane
// (F7) give Harper's message and its corrections, and Ignore Once; a correction changes only the
// characters that differ, where the words are the source's own.

import { register } from '../commands.js';
import { mk, PREFS, store } from '../ui/dom.js';
import { spellPlan, occSource, grammarBlocks, lintSource, DICT_NAME } from '../spell/words.js';
import { SpellClient } from '../spell/client.js';
import { openThesaurus } from '../ui/thespane.js';
import { spellPaneRefresh } from '../ui/spellpane.js';
import { openMenu } from '../ui/kit.js';

const SPELL = typeof __RIKUY_SPELL__ === 'undefined' ? null : __RIKUY_SPELL__;
// the thesaurus a dictionary's words are looked up in (British English in WordNet's)
const THES_OF = { en_US: 'en_US', en_GB: 'en_US', de_DE: 'de_DE', es_ES: 'es_ES' };
const ICON = { thes: '<path d="M4.5 4h8.5a2 2 0 0 1 2 2v10H6.5a2 2 0 0 1-2-2zM4.5 14a2 2 0 0 1 2-2H15M8 6.5h4M8 9h3"/>' };
const MAX_LINTS = 3000, BATCH = 100000;

register(
  { id: 'thesaurus', name: 'Thesaurus', label: 'Thesaurus', tab: 'review', group: 'proofing', el: 'rv-thes', order: 20, icon: ICON.thes, keys: ['Shift+F7'], keyScope: 'app',
    title: 'Thesaurus (Shift+F7): words of like meaning for the word at the cursor, each put in its place with one press',
    synonyms: ['Synonyms', 'Words of similar meaning', 'Antonyms', 'Other words for', 'Research word'],
    when: (app) => app.thesAvailable(), whyNot: (app) => app.thesWhyNot(), run: (app) => app.openThesaurus() },
  { id: 'synonyms', name: 'Synonyms', menu: { text: 85 }, title: 'Words of like meaning for this word, from the thesaurus: one press puts it in; Thesaurus… for more',
    synonyms: ['Thesaurus', 'Other words'], when: (app, at) => app.thesAvailable() && !!app.thesAt(at && at.c), whyNot: (app) => (app.thesAvailable() ? 'Put the cursor in a word' : app.thesWhyNot()),
    run: (app, args, at) => { const x = app.thesAt(at && at.c); if (x) app.synonymsMenu(x); else app.openThesaurus(); } },
  { id: 'grammar-as-you-type', name: 'Check Grammar as You Type', kind: 'toggle',
    title: 'Mark grammar (Harper: agreement, articles, repeated words, word choice) with a blue double line as you type, and check it with spelling in the Spelling and Grammar pane',
    synonyms: ['Grammar', 'Grammar check', 'Check grammar', 'Spelling and Grammar', 'Editor'], when: (app) => app.grammarAvailable(), whyNot: () => 'This copy of Rikuy has no grammar checker (the hosted Rikuy has Harper)',
    on: (app) => app.grammarOn(), run: (app) => app.grammarToggle() }
);

const capsLike = (w, t) => (/^\p{Lu}[\p{Ll}'’-]*$/u.test(w) && w.length > 1 ? t.charAt(0).toUpperCase() + t.slice(1) : /^\p{Lu}+$/u.test(w) && w.length > 1 ? t.toUpperCase() : t);
const debounce = (fn, ms) => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); }; };

export const methods = {
  // ---- the thesaurus ------------------------------------------------------------------------
  thesAvailable() { return !!(SPELL && SPELL.thes && Object.keys(SPELL.thes).length && this.spellAvailable && this.spellAvailable()); },
  thesWhyNot() { return SPELL && SPELL.thes ? 'This browser cannot run the thesaurus here' : 'This copy of Rikuy has no thesaurus (the hosted Rikuy has one)'; },
  // the word at the cursor: {f, s, e, w, dict}, from spelling's reading of the page
  thesAt(c) {
    c = c || (this.caretNow ? this.caretNow() : null);
    if (!c || c.f == null || !this.model) return null;
    const S = this.spellState();
    if (!S.plan || S.planModel !== this.model) { S.plan = spellPlan(this.model, { files: this.files, main: this.main }); S.planModel = this.model; }
    const p = c.collapsed === false ? c.a : c.p;
    for (const o of S.plan.occ) {
      const run = S.plan.runs[o.r];
      if (run.f !== c.f) continue;
      const x = occSource(S.plan, o);
      if (x && x.s <= p && p <= x.e) return { f: x.f, s: x.s, e: x.e, w: x.w, dict: o.dict };
    }
    return null;
  },
  // a thesaurus term as a word to put in: without WordNet's "(generic term)" and the like
  thesTerm(t) { return String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); },
  async synonymsFor(word, dict) {
    const S = this.spellState();
    dict = dict || (S.plan && S.plan.dict) || 'en_US';
    const thes = THES_OF[dict];
    if (!thes || !SPELL.thes[thes]) throw new Error('there is no thesaurus for ' + (DICT_NAME[dict] || dict));
    if (!S.client) S.client = new SpellClient(location.href, this.spellSpec());
    const key = thes + '|' + word.toLowerCase();
    S.syn = S.syn || new Map();
    if (!S.syn.has(key)) {
      const pr = S.client.synonyms(dict, thes, word);
      S.syn.set(key, pr);
      pr.then((r) => S.syn.set(key, r), () => S.syn.delete(key));
      if (S.syn.size > 300) S.syn.delete(S.syn.keys().next().value);
    }
    return S.syn.get(key);
  },
  synonymsNow(word, dict) {
    const S = this.spellState();
    const thes = THES_OF[dict || (S.plan && S.plan.dict) || 'en_US'];
    const v = S.syn && S.syn.get(thes + '|' + word.toLowerCase());
    return v && !(v instanceof Promise) ? v : null;
  },
  openThesaurus(target) { openThesaurus(this, target); },
  // the word put in place of the one at x: the letters that differ, one step
  thesInsert(x, term) {
    const S = this.spellState();
    if (S.planModel !== this.model && this.model) { S.plan = spellPlan(this.model, { files: this.files, main: this.main }); S.planModel = this.model; }
    if (this.src(x.f).slice(x.s, x.e) !== x.w) { this.toast('That word is no longer there.'); return false; }
    const to = capsLike(x.w, term);
    const ed = this.spellEdit({ w: x.w, f: x.f, s: x.s, e: x.e }, to);
    if (!ed) { this.toast('That word runs across formatting: change it in the source.'); return false; }
    this.closeGroup();
    this.commit([ed], { f: x.f, p: ed.s + ed.t.length }, 'spell');
    this.closeGroup();
    return true;
  },
  // the right click menu's Synonyms: a menu of its own at the same place, the first words and
  // the Thesaurus pane
  synonymsMenu(x) {
    const xy = this.ctxXY;
    const rect = xy ? new DOMRect(xy[0], xy[1], 0, 0) : null;
    const show = (r) => {
      const items = [];
      const terms = [];
      for (const m of (r && r.meanings) || []) for (const t of m.terms) { const p = this.thesTerm(t); if (p && p.toLowerCase() !== (r.head || '').toLowerCase() && !terms.includes(p)) terms.push(p); }
      if (!r) items.push({ name: 'Looking for synonyms…', disabled: true });
      else if (!terms.length) items.push({ name: '(no synonyms)', disabled: true });
      for (const t of terms.slice(0, 8)) items.push({ name: capsLike(x.w, t), title: 'Put “' + capsLike(x.w, t) + '” in place of “' + x.w + '”', run: () => { this.ribbonBack(); this.thesInsert(x, t); } });
      items.push(null, { name: 'Thesaurus…', keys: 'Shift+F7', run: () => this.openThesaurus(x) });
      openMenu(this, rect || this.root.getBoundingClientRect(), items, { label: 'Synonyms', cls: 'pop-ctx' });
    };
    const now = this.synonymsNow(x.w, x.dict);
    show(now);
    if (!now) this.synonymsFor(x.w, x.dict).then((r) => { if (this.pop && this.pop.el.getAttribute('aria-label') === 'Synonyms') show(r); }, () => {});
  },

  // ---- grammar ------------------------------------------------------------------------------
  grammarAvailable() { return !!(SPELL && SPELL.grammar && typeof Worker === 'function' && typeof WebAssembly === 'object' && window.crypto && crypto.subtle); },
  grammarOn() { return this.prefs.grammar === true && this.grammarAvailable() && !(this.gr && this.gr.dead); },
  grammarState() {
    if (!this.gr) this.gr = { cache: new Map(), bad: [], blocks: [], once: new Set(), ignore: new Set(), seq: 0, client: null, dead: '' };
    return this.gr;
  },
  grammarToggle() {
    this.prefs.grammar = this.prefs.grammar !== true;
    store(PREFS, this.prefs);
    this.grammarRun();
    this.ribbonSoon();
  },
  grammarSoon() {
    if (!this.grammarSoonD) this.grammarSoonD = debounce(() => this.grammarRun(), 400);
    this.grammarSoonD();
  },
  async grammarRun() {
    const G = this.grammarState();
    if (!this.grammarOn() || !this.model) { G.bad = []; G.blocks = []; this.grammarPaint(); return; }
    if (!G.client) G.client = new SpellClient(location.href, { worker: this.assetUrl(SPELL.grammar.worker), wasm: { ...SPELL.grammar.wasm, name: this.assetUrl(SPELL.grammar.wasm.name) } });
    const seq = ++G.seq;
    const blocks = grammarBlocks(this.model, { files: this.files, main: this.main });
    G.blocks = blocks;
    this.grammarPaint();
    const dialect = blocks.length && blocks[0].dict === 'en_GB' ? 1 : 0;
    const key = (t) => dialect + '|' + t;
    const need = [...new Set(blocks.map((b) => b.text).filter((t) => !G.cache.has(key(t))))];
    const t0 = performance.now();
    for (let k = 0; k < need.length;) {
      const part = [];
      let len = 0;
      while (k < need.length && (len === 0 || len + need[k].length < BATCH)) { part.push(need[k]); len += need[k].length + 2; k++; }
      const text = part.join('\n\n');
      let r;
      try { r = await G.client.lint(text, dialect); } catch (e) {
        if (G.client.dead) { G.dead = G.client.dead; this.toast('Grammar stopped: ' + G.dead, 6000); this.ribbonSoon(); }
        break;
      }
      // (each lint back to its block's text; one across two blocks is dropped)
      const starts = [];
      let at = 0;
      for (const t of part) { starts.push(at); at += t.length + 2; }
      const per = part.map(() => []);
      for (const l of r) {
        let i = starts.length - 1;
        while (i > 0 && starts[i] > l.s) i--;
        const s = l.s - starts[i], e = l.e - starts[i];
        if (e <= part[i].length) per[i].push({ ...l, s, e });
      }
      part.forEach((t, i) => G.cache.set(key(t), per[i]));
      if (G.cache.size > 6000) for (const k2 of [...G.cache.keys()].slice(0, 2000)) G.cache.delete(k2);
      if (seq !== G.seq) return;
    }
    G.lastRun = { blocks: blocks.length, linted: need.length, ms: performance.now() - t0 };
    if (seq === G.seq) this.grammarPaint(dialect);
  },
  // the issues to mark: each lint's place in the source, unless ignored or on a word spelling
  // marks already; blue double lines under them
  grammarPaint(dialect) {
    const G = this.grammarState();
    const bad = [];
    if (this.grammarOn()) {
      const d = dialect != null ? dialect : G.blocks.length && G.blocks[0].dict === 'en_GB' ? 1 : 0;
      const sp = (this.sp && this.sp.bad) || [];
      for (const B of G.blocks) {
        const ls = G.cache.get(d + '|' + B.text);
        if (!ls) continue;
        for (const l of ls) {
          const x = lintSource(B, l.s, l.e);
          if (!x) continue;
          const words = B.text.slice(l.s, l.e);
          if (G.ignore.has(l.msg + '|' + words)) continue;
          x.key = x.f + '|' + x.s + '|' + l.msg;
          if (G.once.has(x.f + '|' + words + '|' + l.msg)) continue;
          if (sp.some((y) => y.f === x.f && y.s < Math.max(x.e, x.s + 1) && x.s < y.e)) continue;
          Object.assign(x, { g: true, msg: l.msg, kind: l.kind, sugg: l.sugg, words, ctx: B.text, i: l.s, j: l.e, src: this.src(x.f).slice(x.s, x.e) });
          bad.push(x);
          if (bad.length >= MAX_LINTS) break;
        }
        if (bad.length >= MAX_LINTS) break;
      }
    }
    G.bad = bad;
    const HL = window.CSS && CSS.highlights;
    if (HL && window.Highlight && this.index) {
      const byF = new Map();
      for (const x of bad) { if (!byF.has(x.f)) byF.set(x.f, []); byF.get(x.f).push([x.s, Math.max(x.e, x.s + 1)]); }
      const ranges = [];
      for (const [f, rs] of byF) { rs.sort((a, b) => a[0] - b[0]); ranges.push(...this.index.domRanges(f, rs)); }
      if (ranges.length) HL.set('rk-grammar', new window.Highlight(...ranges)); else HL.delete('rk-grammar');
    }
    spellPaneRefresh(this);
  },
  grammarAt(c) {
    c = c || (this.caretNow ? this.caretNow() : null);
    const G = this.gr;
    if (!c || c.f == null || !G || !G.bad.length) return null;
    const p = c.collapsed === false ? c.a : c.p;
    return G.bad.find((x) => x.f === c.f && x.s <= p && p <= Math.max(x.e, x.s + 1)) || null;
  },
  grammarAtPoint(p) {
    const H = window.CSS && CSS.highlights && CSS.highlights.get('rk-grammar');
    if (!H || !p) return false;
    for (const r of H) { try { if (r.isPointInRange(p.startContainer, p.startOffset)) return true; } catch (e) { /* another document */ } }
    return false;
  },
  // a correction: the characters that differ, where the issue's words are the source's own
  grammarApply(x, sg) {
    const src = this.src(x.f);
    if (src.slice(x.s, x.e) !== x.src) { this.toast('Those words are no longer there.'); return false; }
    if (x.e > x.s && x.src !== x.words) { this.toast('Those words run across formatting: change them in the source.'); return false; }
    let s = x.s, e = x.e, t = sg.kind === 'remove' ? '' : sg.text;
    if (sg.kind === 'insert') { s = e = x.e; }
    else {
      // (only what differs: "is is" to "is" takes out " is")
      const old = src.slice(s, e);
      let p = 0;
      while (p < old.length && p < t.length && old[p] === t[p]) p++;
      let q = 0;
      while (q < old.length - p && q < t.length - p && old[old.length - 1 - q] === t[t.length - 1 - q]) q++;
      s += p; e -= q; t = t.slice(p, t.length - q);
    }
    if (s === e && !t) return false;
    this.closeGroup();
    this.commit([{ f: x.f, s, e, t: t ? this.escapeAt(x.f, s, t) : '' }], { f: x.f, p: s + t.length }, 'spell');
    this.closeGroup();
    return true;
  },
  grammarIgnoreOnce(x) { this.grammarState().once.add(x.f + '|' + x.words + '|' + x.msg); this.grammarPaint(); },
  grammarIgnoreRule(x) { this.grammarState().ignore.add(x.msg + '|' + x.words); this.grammarPaint(); },
  suggLabel(sg) { return sg.kind === 'remove' ? 'Remove' : sg.kind === 'insert' ? 'Insert “' + sg.text + '”' : sg.text || '(nothing)'; },
  // the right click menu's grammar part (a long press's on a phone): the message, corrections
  grammarMenuItems(at) {
    if (!this.grammarOn()) return null;
    const x = this.grammarAt(at && at.c);
    if (!x) return null;
    const items = [{ name: x.msg, disabled: true, cls: 'mi-hint' }];
    for (const sg of x.sugg.slice(0, 4)) items.push({ name: this.suggLabel(sg), cls: 'mi-sugg', title: 'Change “' + x.words + '”', run: () => { this.ribbonBack(); this.grammarApply(x, sg); } });
    items.push(null, { name: 'Ignore Once', title: 'Leave this one as it is', run: () => this.grammarIgnoreOnce(x) },
      { name: 'Spelling and Grammar…', keys: 'F7', run: () => this.openSpelling(x) }, null);
    return items;
  }
};
