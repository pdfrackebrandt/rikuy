// Word, both ways: open a .docx as a project, save the project as a .docx with native Word
// equations, and bring a coauthor's edits to that .docx back into the .tex as changes to accept or
// reject under Review. pandoc does the conversions in a worker of its own (src/wordworker.js),
// fetched the first time a Word action is used; the methods here join App's prototype, as
// collab.js's do. A build without Word (RIKUY_NO_WORD, the claude.ai copy, which has no room for
// pandoc) keeps the buttons and says where Word support is.
import { buildWordDoc } from './wordast.js';
import { pageForWord } from './pageword.js';
import { checkData, planImport, unpackRead } from './wordsync.js';
import { loadPdfjs } from './pdfview.js';
import { kvGet, kvPut } from './store.js';
import { cleanProjectName } from './collab.js';

const $ = (s, r = document) => r.querySelector(s);
const WORD = typeof __RIKUY_WORD__ === 'undefined' ? true : __RIKUY_WORD__;
const HOST = typeof __RIKUY_WORD_HOST__ === 'undefined' ? '' : __RIKUY_WORD_HOST__;
export const wordEnabled = () => WORD;
export const isDocx = (f) => /\.docx$/i.test((f && (f.name || f.webkitRelativePath)) || '') || (f && f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const MAX_DOCX = 100e6;

// A numeric citation style of Rikuy's own for pandoc's citeproc (its default is author-date):
// [1] in the text, the list in citation order
const NUMERIC_CSL_ANY = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" demote-non-dropping-particle="sort-only">
<info><title>Rikuy numeric</title><id>rikuy-numeric</id><updated>2026-11-10T00:00:00+00:00</updated></info>
<macro name="author"><names variable="author"><name initialize-with=". " delimiter=", " and="text"/><substitute><names variable="editor"/></substitute></names></macro>
<macro name="year"><date variable="issued"><date-part name="year"/></date></macro>
<citation collapse="citation-number"><sort><key variable="citation-number"/></sort><layout prefix="[" suffix="]" delimiter=", "><text variable="citation-number"/><text variable="locator" prefix=", "/></layout></citation>
<bibliography second-field-align="flush">%SORT%<layout suffix="."><text variable="citation-number" prefix="[" suffix="] "/><group delimiter=". "><text macro="author"/><text variable="title"/><text variable="container-title" font-style="italic"/><text variable="publisher"/><text macro="year"/></group></layout></bibliography>
</style>
`;
// (two of it: in citation order, as unsrt and ieeetr number; by author, year and title, as plain,
// abbrv, alpha and the page number them. Word had citation order alone, so under plain its [1]
// was another entry than the PDF's and the page's [1].)
const NUMERIC_CSL = NUMERIC_CSL_ANY.replace('%SORT%', '');
// (sorted as BibTeX's plain sorts: "van Dijk" under v, its particle kept with the family name;
// CSL's sort-only took it under D, review E7)
const NUMERIC_CSL_SORTED = NUMERIC_CSL_ANY.replace('%SORT%', '<sort><key macro="author"/><key macro="year"/><key variable="title"/></sort>').replace('demote-non-dropping-particle="sort-only"', 'demote-non-dropping-particle="never"');
export const numericCsl = (sorted) => (sorted ? NUMERIC_CSL_SORTED : NUMERIC_CSL);

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
      // under the installed app, the page's own version of the worker (src/pwa.js, asset)
      this.wordE = new WordEngine(this.assetUrl ? this.assetUrl('word/') : new URL('word/', location.href).href);
      this.wordE.onStatus = (s) => {
        const pct = s.total ? ' ' + Math.round(100 * s.done / s.total) + ' %' : '';
        $('#st-save').textContent = s.status + pct + (s.total ? ' (' + (s.total / 1e6).toFixed(0) + ' MB, once)' : '');
      };
    }
    return this.wordE;
  },

  // The marks of the Word files this browser exported (the newest 300), kept with the projects
  async wordMarks() {
    if (!this.wordMarkList) {
      let l = null;
      if (!this.noIdb) { try { l = await kvGet('word-exports'); } catch (e) { l = null; } }
      this.wordMarkList = Array.isArray(l) ? l.filter((m) => typeof m === 'string' && /^[0-9a-f]{64}$/.test(m)) : [];
    }
    return this.wordMarkList;
  },
  async wordRemember(mark) {
    if (!/^[0-9a-f]{64}$/.test(mark || '')) return;
    const l = await this.wordMarks();
    if (!l.includes(mark)) l.push(mark);
    while (l.length > 300) l.shift();
    if (!this.noIdb) await kvPut('word-exports', l).catch(() => {});
  },
  async wordKnows(mark) {
    return /^[0-9a-f]{64}$/.test(mark || '') && (await this.wordMarks()).includes(mark);
  },

  // "Make available offline" (src/pwa.js): start pandoc once, so the worker fetches, checks and
  // keeps it in IndexedDB; false where this build has no Word
  async keepWord() {
    if (!WORD) return false;
    // the worker reports its start in the status line: put back what the line said
    const keep = $('#st-save').textContent;
    try { await this.wordEngine().run('ping', {}); } finally { $('#st-save').textContent = keep; }
    return true;
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
      await this.wordRemember(res.mark);
      const blob = new Blob([res.docx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const fname = (this.fileBase ? this.fileBase() : 'paper') + '.docx';
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
    // (the document as TeX reads it: blocks shown as their LaTeX for now, src/cmd/view.js, are a view)
    const model = this.plainModel ? this.plainModel() : this.model;
    const bibs = [...this.files.keys()].filter((n) => /\.bib$/i.test(n));
    const csl = [...this.extra.keys()].find((n) => /\.csl$/i.test(n));
    const resources = {};
    for (const b of bibs) resources[b] = this.files.get(b);
    let cslName = null;
    if (csl) { cslName = csl; resources[csl] = new Uint8Array(await this.extra.get(csl).arrayBuffer()); }
    else if (model.opts.citeStyle === 'numeric') { cslName = 'rikuy-numeric.csl'; resources[cslName] = numericCsl(model.opts.sort !== false); }
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
      // (an interactive graph's PGF picture: Word gets the graph drawn as a PNG)
      if (/\.pgf$/i.test(k)) { pics.set(k, k + '.png'); return k + '.png'; }
      pics.set(k, k);
      return k;
    };
    // the changes waiting, as Word's tracked changes with their authors (those in plain prose; the
    // rest go as the text is now, and the Word file says so)
    const all = this.base && this.realChanges ? this.realChanges() : [];
    const plain = all.length && this.plainChanges ? this.plainChanges() : [];
    const changes = plain.map((c) => ({ f: c.f, s: c.bs, e: c.be, del: c.a, who: this.rvName(c.who) }));
    const W = buildWordDoc(model, this.files, { citeproc, asset, comments: true, main: this.main, changes });
    const left = all.length - (W.tracked || 0);
    if (left > 0) W.degraded.push(left + (left === 1 ? ' change' : ' changes') + ' waiting that are not plain words (formatting, equations, commands), as the text is now, not marked as changes');
    for (const [k, out] of pics) {
      try {
        const bytes = new Uint8Array(await this.assetBlobs.get(k).arrayBuffer());
        resources[out] = /\.pdf$/i.test(k) ? await this.pdfPicture(bytes) : /\.pgf$/i.test(k) ? await this.graphPictureBytes(k) : bytes;
        if (!resources[out]) throw new Error('no picture');
      } catch (e) { W.degraded.push(k + ' (could not be drawn)'); }
    }
    return {
      doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources, bibs: citeproc ? bibs : [], csl: citeproc ? cslName : null, citeproc, vonSort: cslName === 'rikuy-numeric.csl' && model.opts.sort !== false,
      bullets: W.bullets,
      toc: W.doc.blocks && model.blocks.some((u) => u.items.some((x) => x.type === 'toc')),
      // the page's set up (task 44): paper, margins, columns, headers and footers, in Word's terms
      page: pageForWord(model, this.src(this.main)),
      degraded: model.opts.page && model.opts.page.wm && model.opts.page.wm.on ? [...W.degraded, 'the watermark (Word draws one as a shape of its own: Design › Watermark there)'] : W.degraded,
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
  async openDocx(file, from) {
    if (!WORD) { this.wordMissing(); return; }
    if (file.size > MAX_DOCX) { this.toast(file.name + ' is larger than 100 MB; Rikuy does not open Word files that large.', 8000); return; }
    if (this.wordBusy) return;
    this.wordBusy = true;
    const keep = $('#st-save').textContent;
    try {
      this.toast('Reading ' + file.name + '…', 60000);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = await this.wordEngine().run('read', { bytes: bytes.slice() });
      // edits are merged only from an export this browser made (wordRemember); a file carrying
      // any other Rikuy data opens as a Word file does, as a document of its own
      let note = '';
      if (read && read.data) {
        if (await this.wordKnows(read.mark)) { await this.wordEdits(read, file.name); return; }
        note = ' It carries edits to a Rikuy export this browser did not make (another computer, a cleared browser, or data that was changed), so it opened as a new document and nothing was merged into a project.';
      }
      const r = await this.wordEngine().run('open', { bytes, name: file.name });
      await this.openWordProject(r, file.name, note);
    } catch (e) {
      this.toast('Could not open ' + file.name + ': ' + ((e && e.message) || e), 10000);
    } finally { this.wordBusy = false; $('#st-save').textContent = keep; }
  },

  async openWordProject(r, fname, note = '') {
    if (this.base) { await this.snapshot('Before opening another project', { force: !this.lastSig }); await this.stashBinary(); }
    // (a name of its own, as a .zip gets: a stranger's thesis.docx under the user's own thesis
    // shared its versions and marks, V1)
    const name = await this.freeProjectName(cleanProjectName(fname.replace(/\.docx$/i, '').split('/').pop(), 'Word document'));
    const files = new Map([['main.tex', r.tex]]);
    if (r.bib) files.set('references.bib', r.bib);
    // a stranger's Word file is content from someone else, as a .zip is
    this.markFromLink('', name, 'main.tex', 'docx');
    this.loadProject(files, 'main.tex', name, 'Opened from Word');
    for (const [n, b] of Object.entries(r.media || {})) this.addAsset(n, new Blob([b]));
    if (Object.keys(r.media || {}).length) { this.binaryDirty = true; this.forceRender = true; this.rebuild(); this.persist(); }
    // the file's tracked changes: changes waiting here, each its author's, Track Changes' base the
    // text with all of them rejected, the layer of who wrote what made in the worker (src/wordjobs.js
    // openDocx); they came in accepted before
    const T = r.tracked;
    let tracked = 0, by = '', cut = '';
    if (T && typeof T.base === 'string' && Array.isArray(T.segs) && Array.isArray(T.authors)) {
      this.authors = new Map([['main.tex', T.segs]]);
      const bf = new Map(this.files);
      bf.set('main.tex', T.base);
      this.setBase({ t: Date.now(), label: 'Before the tracked changes in ' + fname, files: bf });
      tracked = this.realChanges().length;
      if (tracked) { this.setMarks(true); this.toggleNav(true, 'changes'); }
      // (a few names, the rest counted: a file reviewed by hundreds would fill the screen)
      const A = T.authors.map((x) => String(x).slice(0, 80));
      by = A.length > 4 ? A.slice(0, 3).join(', ') + ' and ' + (A.length - 3) + ' others' : A.length > 1 ? A.slice(0, -1).join(', ') + ' and ' + A[A.length - 1] : A[0] || 'Word';
      if (T.cut) cut = ' The changes before line ' + T.upto + ' of main.tex are credited to "Word", not to their authors: the file holds more pieces of tracked text than the ' + T.segs.length + ' Rikuy tells apart in a file.';
    }
    const n = Object.keys(r.media || {}).length;
    // what did not come over, or came differently: said here, and kept at the top of main.tex
    // (src/wordjobs.js), where it stays after the toast is gone
    const said = r.warnings || [];
    this.toast('Opened ' + fname + ' as LaTeX' + (n ? ', with ' + n + (n === 1 ? ' picture' : ' pictures') + ' in figures/' : '') + (r.bib ? ' and its citations in references.bib' : '') + '.' + (tracked ? ' Its tracked changes are ' + tracked + (tracked === 1 ? ' change' : ' changes') + ' by ' + by + ', marked on the page to accept or reject under Review.' + cut : '') + (said.length ? ' ' + said.slice(0, 4).join(' ') + (said.length > 4 ? ' The rest is at the top of main.tex.' : '') : '') + note, (note || cut ? 16000 : 9000) + 5000 * Math.min(4, said.length));
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
    // (changes of your own waiting: kept, Word's come beside them, never into the base)
    const pending = !!this.base && this.realChanges().length > 0;
    await this.snapshot('Before the edits from Word (' + who + ')', { force: true });
    this.closePop(true);
    this.closeGroup();
    const edits = [];
    for (const [f, t] of plan.files) edits.push({ f, s: 0, e: (this.files.get(f) ?? '').length, t });
    this.markFromLink(who, this.name, this.main, 'word');
    this.commit(edits, null, 'word');
    this.closeGroup();
    if (!pending) this.setBase({ t: Date.now(), label: 'Before the edits from Word (' + who + ')', files: mine });
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

// Save's menu of .zip, Word and PDF, which this bound, is the ribbon's Download group now
// (src/ribbon.js): nothing is left to install.
export function installWord() {}
