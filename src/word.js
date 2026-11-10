// Word, both ways: open a .docx as a project, save the project as a .docx with native Word
// equations, and bring a coauthor's edits to that .docx back into the .tex as changes to accept or
// reject under Review. pandoc does the conversions in a worker of its own (src/wordworker.js),
// fetched the first time a Word action is used; the methods here join App's prototype, as
// collab.js's do. A build without Word (RIKUY_NO_WORD, the claude.ai copy, which has no room for
// pandoc) keeps the buttons and says where Word support is.
import { buildWordDoc } from './wordast.js';
import { checkData, planImport, unpackRead } from './wordsync.js';
import { loadPdfjs } from './pdfview.js';

const $ = (s, r = document) => r.querySelector(s);
const WORD = typeof __RIKUY_WORD__ === 'undefined' ? true : __RIKUY_WORD__;
const HOST = typeof __RIKUY_WORD_HOST__ === 'undefined' ? '' : __RIKUY_WORD_HOST__;
export const wordEnabled = () => WORD;
export const isDocx = (f) => /\.docx$/i.test((f && (f.name || f.webkitRelativePath)) || '') || (f && f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const MAX_DOCX = 100e6;

// A numeric citation style of Rikuy's own for pandoc's citeproc (its default is author-date):
// [1] in the text, the list in citation order
const NUMERIC_CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" demote-non-dropping-particle="sort-only">
<info><title>Rikuy numeric</title><id>rikuy-numeric</id><updated>2026-11-10T00:00:00+00:00</updated></info>
<macro name="author"><names variable="author"><name initialize-with=". " delimiter=", " and="text"/><substitute><names variable="editor"/></substitute></names></macro>
<macro name="year"><date variable="issued"><date-part name="year"/></date></macro>
<citation collapse="citation-number"><sort><key variable="citation-number"/></sort><layout prefix="[" suffix="]" delimiter=", "><text variable="citation-number"/><text variable="locator" prefix=", "/></layout></citation>
<bibliography second-field-align="flush"><layout suffix="."><text variable="citation-number" prefix="[" suffix="] "/><group delimiter=". "><text macro="author"/><text variable="title"/><text variable="container-title" font-style="italic"/><text variable="publisher"/><text macro="year"/></group></layout></bibliography>
</style>
`;

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

  // ---- Save as Word ----
  async saveDocx() {
    if (!WORD) { this.wordMissing(); return; }
    const D = this.caps.downloads;
    if (!D && window.claude) { this.toast('Saving is not available in this view.'); return; }
    if (this.wordBusy) return;
    this.wordBusy = true;
    const keep = $('#st-save').textContent;
    try {
      this.toast('Making the Word file…', 60000);
      const req = await this.wordRequest();
      const res = await this.wordEngine().run('export', { req });
      const blob = new Blob([res.docx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const fname = (this.name || 'paper').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') + '.docx';
      this.lastDocx = { blob, name: fname, degraded: req.degraded, warnings: res.warnings };
      if (D) await D.save({ filename: fname, data: blob });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      this.snapshot('Saved ' + fname, { force: true, named: true });
      const lost = [...req.degraded, ...(res.unread ? [res.unread + ' equation(s) Word may not edit cleanly'] : [])];
      this.toast('Saved ' + fname + '. Equations are Word equations; open the edited file here again (Open) and the edits come back as changes to accept or reject.' + (lost.length ? ' Shown differently in Word: ' + lost.join('; ') + '.' : ''), 12000);
    } catch (e) {
      if (!(e && e.code === 'declined')) this.toast('Could not make the Word file: ' + ((e && e.message) || e), 10000);
    } finally { this.wordBusy = false; $('#st-save').textContent = keep; }
  },

  async wordRequest() {
    const model = this.model;
    const bibs = [...this.files.keys()].filter((n) => /\.bib$/i.test(n));
    const csl = [...this.extra.keys()].find((n) => /\.csl$/i.test(n));
    const resources = {};
    for (const b of bibs) resources[b] = this.files.get(b);
    let cslName = null;
    if (csl) { cslName = csl; resources[csl] = new Uint8Array(await this.extra.get(csl).arrayBuffer()); }
    else if (model.opts.citeStyle === 'numeric') { cslName = 'rikuy-numeric.csl'; resources[cslName] = NUMERIC_CSL; }
    const citeproc = bibs.length > 0 && model.cites && model.cites.length > 0;
    const find = (name) => {
      if (!name) return null;
      const base = name.replace(/^\.\//, '');
      const keys = [...this.assetBlobs.keys()];
      for (const c of [base, ...['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf'].map((x) => base + x)]) if (this.assetBlobs.has(c)) return c;
      const short = base.split('/').pop();
      return keys.find((k) => { const kb = k.split('/').pop(); return kb === short || kb.replace(/\.[^.]+$/, '') === short; }) || null;
    };
    // pictures Word shows as they are; a PDF figure becomes a picture of its first page
    const pics = new Map();
    const asset = (name) => {
      const k = find(name);
      if (!k) return null;
      if (/\.eps$/i.test(k)) return null;
      if (/\.pdf$/i.test(k)) { pics.set(k, k.replace(/\.pdf$/i, '.pdf.png')); return k.replace(/\.pdf$/i, '.pdf.png'); }
      pics.set(k, k);
      return k;
    };
    const W = buildWordDoc(model, this.files, { citeproc, asset, comments: true });
    for (const [k, out] of pics) {
      try {
        const bytes = new Uint8Array(await this.assetBlobs.get(k).arrayBuffer());
        resources[out] = /\.pdf$/i.test(k) ? await this.pdfPicture(bytes) : bytes;
      } catch (e) { W.degraded.push(k + ' (could not be drawn)'); }
    }
    return {
      doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources, bibs: citeproc ? bibs : [], csl: citeproc ? cslName : null, citeproc,
      toc: W.doc.blocks && model.blocks.some((u) => u.items.some((x) => x.type === 'toc')),
      degraded: W.degraded,
      project: { name: this.name, main: this.main, files: [...this.files.entries()] },
      app: 'Rikuy'
    };
  },

  // the first page of a PDF figure as a PNG, drawn by the page's own pdf.js at twice its size
  async pdfPicture(bytes) {
    const lib = await loadPdfjs(new URL('tex/pdf.worker.min.mjs', location.href).href);
    const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    try {
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = Math.min(4000, Math.ceil(vp.width)); c.height = Math.min(4000, Math.ceil(vp.height));
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return new Uint8Array(await b.arrayBuffer());
    } finally { doc.destroy(); }
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
      const read = await this.wordEngine().run('read', { bytes: bytes.slice() });
      if (read && read.data) { await this.wordEdits(read, file.name); return; }
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

  // ---- a coauthor's edits come back ----
  async wordEdits(read, fname) {
    const data = checkData(read.data);
    if (!data) { this.toast(fname + ' carries Rikuy data this editor cannot read; it was not changed.', 9000); return; }
    const X = unpackRead(read.X);
    const who = (X.authors[0] || read.lastBy || 'Word').replace(/[()]/g, '').trim() || 'Word';
    // the project it came from: the one open, else its latest version here, else the text as
    // it was exported (the file carries it)
    if (!(data.name === this.name && data.main === this.main)) {
      if (this.base) { await this.snapshot('Before opening a Word file', { force: !this.lastSig }); await this.stashBinary(); }
      const last = (await this.allSnaps()).find((v) => v.name === data.name && v.main === data.main);
      const files = last ? await this.versionFiles(last) : null;
      if (last && files) { await this.loadBinary(data.name, data.main); this.loadProject(new Map(files), data.main, data.name, 'Opened', true); }
      else { this.markFromLink(who, data.name, data.main, 'word'); this.loadProject(new Map(data.files), data.main, data.name, 'As exported to Word'); }
    }
    const mine = new Map(this.files);
    const plan = planImport(data, X, mine, { who });
    if (!plan.files.size) { this.toast(fname + ' has no changes to the text exported from Rikuy.', 7000); return; }
    await this.snapshot('Before the edits from Word (' + who + ')', { force: true });
    this.closePop(true);
    this.closeGroup();
    const edits = [];
    for (const [f, t] of plan.files) edits.push({ f, s: 0, e: (this.files.get(f) ?? '').length, t });
    this.markFromLink(who, this.name, this.main, 'word');
    this.commit(edits, null, 'word');
    this.closeGroup();
    this.setBase({ t: Date.now(), label: 'Before the edits from Word (' + who + ')', files: mine });
    this.setMarks(true);
    this.toggleNav(true, 'changes');
    const S = plan.stats;
    const parts = [];
    if (S.applied) parts.push(S.applied + (S.applied === 1 ? ' edit' : ' edits') + (S.math ? ' (' + S.math + ' in equations)' : ''));
    if (S.comments) parts.push(S.comments + (S.comments === 1 ? ' comment' : ' comments'));
    let msg = 'Brought in from ' + fname + ': ' + (parts.join(' and ') || 'no edits') + ', marked on the page. Accept or reject each under Review.';
    if (S.conflicts) msg += ' ' + S.conflicts + ' could not be applied because you changed the same text since the export; each is a comment where it was.';
    if (S.skipped || S.moved) msg += ' ' + (S.skipped + S.moved) + ' other change' + (S.skipped + S.moved === 1 ? ' is' : 's are') + ' noted as comments (generated text, moved blocks, new table cells).';
    this.toast(msg, 14000);
    this.lastWordPlan = plan;
  }
};

export function installWord(app) {
  // the caret beside Save: .zip or .tex as before, Word, the PDF
  const b = $('#b-save-more');
  if (b) b.addEventListener('click', () => app.openSaveMenu());
}
