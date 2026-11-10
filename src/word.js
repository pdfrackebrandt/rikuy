// Word: open a .docx as a project. pandoc does the conversion in a worker of its own
// (src/wordworker.js), fetched the first time a Word action is used; the methods here join App's
// prototype, as
// collab.js's do. A build without Word (RIKUY_NO_WORD, the claude.ai copy, which has no room for
// pandoc) keeps the buttons and says where Word support is.

const $ = (s, r = document) => r.querySelector(s);
const WORD = typeof __RIKUY_WORD__ === 'undefined' ? true : __RIKUY_WORD__;
const HOST = typeof __RIKUY_WORD_HOST__ === 'undefined' ? '' : __RIKUY_WORD_HOST__;
export const wordEnabled = () => WORD;
export const isDocx = (f) => /\.docx$/i.test((f && (f.name || f.webkitRelativePath)) || '') || (f && f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const MAX_DOCX = 100e6;

// ---- the worker ---------------------------------------------------------------------------------

export class WordEngine {
  constructor(base) { this.base = base; this.w = null; this.seq = 0; this.jobs = new Map(); this.onStatus = () => {}; this.idle = null; }
  start() {
    if (this.w) return;
    // a blob bootstrap, as the TeX worker's: it runs under the page's policy and loads the worker
    // script from its real address next to the page
    const boot = 'self.__rikuyWordBase=' + JSON.stringify(this.base) + ';importScripts(' + JSON.stringify(new URL('word.js', this.base).href) + ');';
    const w = new Worker(URL.createObjectURL(new Blob([boot], { type: 'text/javascript' })));
    this.w = w;
    w.onmessage = ({ data }) => {
      if (data.status) { this.onStatus(data); return; }
      const j = this.jobs.get(data.id);
      if (!j) return;
      this.jobs.delete(data.id);
      clearTimeout(j.timer);
      if (data.error) j.reject(new Error(data.error)); else j.resolve(data.result);
      this.rest();
    };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); this.fail(e.message || 'the Word worker stopped'); };
  }
  fail(msg) {
    for (const j of this.jobs.values()) { clearTimeout(j.timer); j.reject(new Error(msg)); }
    this.jobs.clear();
    if (this.w) this.w.terminate();
    this.w = null;
  }
  // pandoc holds a few hundred MB while it lives: let it go a minute after the last job (the next
  // one starts it from IndexedDB, without the network)
  rest() {
    clearTimeout(this.idle);
    if (!this.jobs.size) this.idle = setTimeout(() => { if (!this.jobs.size && this.w) { this.w.terminate(); this.w = null; } }, 60000);
  }
  run(op, payload, transfer) {
    clearTimeout(this.idle);
    this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      // a file built to keep pandoc busy (a zip bomb inflating slowly) is stopped, not waited on
      const timer = setTimeout(() => this.fail('the Word conversion took more than 4 minutes and was stopped'), 240000);
      this.jobs.set(id, { resolve, reject, timer });
      this.w.postMessage({ id, op, ...payload }, transfer || []);
    });
  }
}

// ---- methods for App --------------------------------------------------------------------------------

export const word = {
  wordEngine() {
    if (!this.wordE) {
      this.wordE = new WordEngine(new URL('word/', location.href).href);
      this.wordE.onStatus = (s) => {
        const pct = s.total ? ' ' + Math.round(100 * s.done / s.total) + ' %' : '';
        $('#st-save').textContent = s.status + pct + (s.total ? ' (' + (s.total / 1e6).toFixed(0) + ' MB, once)' : '');
      };
    }
    return this.wordE;
  },

  wordMissing() {
    this.toast('Word import and export live on the hosted copy of Rikuy' + (HOST ? ' (' + HOST + ')' : '') + ': this copy has no room for pandoc, which does the conversion. Everything else works the same here.', 9000);
  },

  // ---- Open a .docx ----
  async openDocx(file) {
    if (!WORD) { this.wordMissing(); return; }
    if (file.size > MAX_DOCX) { this.toast(file.name + ' is larger than 100 MB; Rikuy does not open Word files that large.', 8000); return; }
    if (this.wordBusy) return;
    this.wordBusy = true;
    const keep = $('#st-save').textContent;
    try {
      this.toast('Reading ' + file.name + '…', 60000);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await this.wordEngine().run('open', { bytes, name: file.name });
      await this.openWordProject(r, file.name);
    } catch (e) {
      this.toast('Could not open ' + file.name + ': ' + ((e && e.message) || e), 10000);
    } finally { this.wordBusy = false; $('#st-save').textContent = keep; }
  },

  async openWordProject(r, fname) {
    const name = fname.replace(/\.docx$/i, '').split('/').pop() || 'Word document';
    if (this.base) { await this.snapshot('Before opening another project', { force: !this.lastSig }); await this.stashBinary(); }
    const files = new Map([['main.tex', r.tex]]);
    if (r.bib) files.set('references.bib', r.bib);
    // a stranger's Word file is content from someone else, as a .zip is
    this.markFromLink('', name, 'main.tex', 'docx');
    this.loadProject(files, 'main.tex', name, 'Opened from Word');
    for (const [n, b] of Object.entries(r.media || {})) this.addAsset(n, new Blob([b]));
    if (Object.keys(r.media || {}).length) { this.binaryDirty = true; this.forceRender = true; this.rebuild(); this.persist(); }
    const n = Object.keys(r.media || {}).length;
    this.toast('Opened ' + fname + ' as LaTeX' + (n ? ', with ' + n + (n === 1 ? ' picture' : ' pictures') + ' in figures/' : '') + (r.bib ? ' and its citations in references.bib' : '') + '.' + (r.warnings && r.warnings.length ? ' ' + r.warnings.slice(0, 3).join(' ') : ''), 9000);
  },
};

export function installWord(app) { void app; }
