// Batch B12, File: the downloads pinned at the ribbon's right end (PDF, Word, LaTeX; one Download
// menu on a phone), Open, Share, New document and Load the sample. B12 adds the File tab's
// backstage (new from a template, recent documents, properties, export, print, options) here.

import { register } from '../commands.js';
import { $ } from '../ui/dom.js';

const LIVE_NOTE = 'Graphs are pictures in a PDF or Word file. Download LaTeX to keep them live.';
const always = () => true;

register(
  // (drawn in src/template.html, in the group "Download" that stays at the row's end in every tab)
  { id: 'download-menu', name: 'Download', el: 'rb-dl-menu', static: true, place: 'download', only: 'narrow', title: 'Download as PDF, Word or LaTeX', when: always, run: (app) => app.openDownloads() },
  { id: 'download-pdf', name: 'Download PDF', el: 'rb-pdf', static: true, place: 'download', only: 'wide', title: 'Download the PDF as TeX makes it', synonyms: ['Export to PDF', 'Save as PDF', 'PDF'], when: always,
    run: async (app) => { await app.downloadPdfNow(); app.ribbonSync(); } },
  { id: 'download-word', name: 'Download Word', el: 'rb-word', static: true, place: 'download', only: 'wide', title: 'Download a Word file (.docx)', synonyms: ['Save as Word', 'Export to Word', 'docx'], when: always,
    // (the note only once a file was made: on a copy without Word the notice about that stays)
    run: async (app) => { const had = app.lastDocx; await app.saveDocx(); if (app.lastDocx !== had) app.liveNote(); app.ribbonSync(); } },
  { id: 'download-latex', name: 'Download LaTeX', el: 'b-save', static: true, place: 'download', only: 'wide', title: 'Download the LaTeX source (Ctrl+S)', keysElsewhere: ['Ctrl+S'], synonyms: ['Save', 'Save a copy', '.tex', '.zip'], when: always,
    run: async (app) => { await app.save(); app.ribbonSync(); } },
  { id: 'open', name: 'Open', el: 'b-open', static: true, place: 'bar', title: 'Open .tex, .bib, images, an Overleaf .zip or a Word .docx (Ctrl+O)', keysElsewhere: ['Ctrl+O'], synonyms: ['Open a file', 'Browse', 'Import'], when: always, run: () => $('#fileinput').click() },
  { id: 'share', name: 'Share', el: 'b-share', static: true, place: 'bar', title: 'A link anyone can open and type in, or a copy for Overleaf', synonyms: ['Share link', 'Overleaf'], when: always, run: (app) => app.openSharePanel() },
  { id: 'new-document', name: 'New document', el: 'b-new', static: true, place: 'status', synonyms: ['New', 'Blank document'], when: always, run: (app) => app.newDocument() },
  { id: 'load-sample', name: 'Load the sample', el: 'b-sample', static: true, place: 'status', synonyms: ['Sample document', 'Example'], when: always, run: (app) => app.resetToSample() }
);

export const methods = {
  // a live graph on the page, as the parser found it (one named in a comment is none)
  hasLive() { return this.renderer.blocks.some((B) => B.atoms.some((a) => a.kind === 'widget')); },
  // PDF and Word hold a live graph as its picture: said once for each document, after what the
  // download itself has to say (Word's "Saved, shown differently in Word"), in the same message
  liveNote() {
    const k = this.name + '|' + this.main;
    if (!this.hasLive() || this.liveTold === k) return;
    this.liveTold = k;
    const said = $('#toast').hidden ? '' : $('#toast').firstChild.textContent;
    this.toast((said ? said + ' ' : '') + LIVE_NOTE, 14000);
  },
  // the LaTeX download's title: what it gives, whether there are changes since, and that it
  // alone keeps live graphs live (the button then carries a mark)
  saveTitle() {
    const b = $('#b-save');
    if (!b) return;
    const live = this.hasLive(), what = this.singleFile() ? this.main.split('/').pop() : 'the project as .zip';
    b.classList.toggle('live', live);
    b.title = (this.zipDirty ? 'Changes since you last saved. ' : '') + 'Download the LaTeX source, ' + what + (live ? ': keeps the live graphs' : '') + ' (Ctrl+S)';
  },

  // The PDF in one click: the one TeX last made when the text has not changed since, else a
  // compile first. The button is busy meanwhile and cannot start a second run. A run that
  // fails opens the preview pane, which holds its error.
  async downloadPdfNow() {
    if (this.pdfBusy) return;
    const b = $('#rb-pdf'), lab = b.querySelector('span');
    const fresh = () => !!this.lastPdf && this.lastPdfSig === this.textSigNow();
    if (!fresh() || this.compiling) {
      this.pdfBusy = true;
      b.disabled = true; b.setAttribute('aria-busy', 'true'); lab.textContent = 'Making the PDF…';
      try {
        this.pdfPane();
        if (!this.compiling) await this.compilePdf();
        // (a run asked for while one was going starts when that one ends)
        while (this.compiling) await new Promise((r) => setTimeout(r, 150));
      } finally {
        this.pdfBusy = false;
        b.disabled = false; b.removeAttribute('aria-busy'); lab.textContent = 'PDF';
      }
    }
    if (fresh()) { await this.downloadPdf(); this.liveNote(); } else if (!document.body.classList.contains('pdf-on')) this.togglePdf(true, true);
  },

  // A phone's one Download button: the three downloads by name, each pressing its own button.
  openDownloads() {
    const p = this.makePop($('#rb-dl-menu'), 'pop-dl', 'Download');
    // a menu named by its title; each item under its button's own name ("Download LaTeX")
    p.setAttribute('role', 'menu');
    p.querySelector('.pop-x').setAttribute('role', 'menuitem');
    this.menuKeys(p);
    for (const id of ['rb-pdf', 'rb-word', 'b-save']) {
      const b = $('#' + id), a = document.createElement('button');
      a.type = 'button'; a.className = 'nav-act'; a.setAttribute('role', 'menuitem'); a.setAttribute('aria-label', b.getAttribute('aria-label')); a.title = b.title;
      a.append(b.querySelector('svg').cloneNode(true), Object.assign(document.createElement('span'), { textContent: b.querySelector('span').textContent }));
      if (id === 'b-save' && b.classList.contains('live')) a.classList.add('live');
      a.addEventListener('click', () => { this.closePop(true); b.click(); });
      p.append(a);
    }
    this.positionPop();
  },
};
